import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encoder = new TextEncoder();
const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedSchoolLevels = new Set(["secundaria", "preparatoria", "universidad"]);
const allowedLookingKinds = new Set(["friends", "projects", "study_groups", "other"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const body = await req.json();
    const userId = String(body?.user_id ?? "");
    const applicationToken = String(body?.application_token ?? "");

    if (!userId || !applicationToken) return json({ error: "INVALID_APPLICATION_LINK" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) return json({ error: "SERVER_CONFIGURATION" }, 500);

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(userId);
    const user = userResult?.user;
    if (userError || !user) return json({ error: "INVALID_APPLICATION_LINK" }, 404);

    const metadata = user.user_metadata ?? {};
    const expectedHash = String(metadata.application_token_hash ?? "");
    const expiresAt = String(metadata.application_token_expires_at ?? "");
    const actualHash = await sha256(applicationToken);

    if (!expectedHash || expectedHash !== actualHash) return json({ error: "INVALID_APPLICATION_LINK" }, 401);
    if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) return json({ error: "APPLICATION_LINK_EXPIRED" }, 410);

    const { data: approval, error: approvalError } = await admin
      .from("account_approvals")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();

    if (approvalError || approval?.status !== "pending") {
      return json({ error: "ACCOUNT_NOT_PENDING" }, 409);
    }

    const username = String(body?.username ?? "").trim();
    const fullName = String(body?.full_name ?? "").trim();
    const birthDate = String(body?.birth_date ?? "");
    const schoolLevel = String(body?.school_level ?? "");
    const schoolName = String(body?.school_name ?? "").trim();
    const bio = String(body?.bio ?? "").trim();
    const acceptsMessageRequests = Boolean(body?.accepts_message_requests);
    const gpa = Number(body?.gpa);
    const interestIds = Array.isArray(body?.interests)
      ? [...new Set(body.interests.map((value: unknown) => String(value)))]
      : [];
    const lookingFor = Array.isArray(body?.looking_for) ? body.looking_for : [];

    if (username.length < 3 || username.length > 30) return json({ error: "INVALID_USERNAME" }, 400);
    if (fullName.length < 2 || fullName.length > 80) return json({ error: "INVALID_FULL_NAME" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || calculateAge(birthDate) < 12) return json({ error: "INVALID_BIRTH_DATE" }, 400);
    if (!allowedSchoolLevels.has(schoolLevel)) return json({ error: "INVALID_SCHOOL_LEVEL" }, 400);
    if (schoolName.length < 2 || schoolName.length > 120) return json({ error: "INVALID_SCHOOL_NAME" }, 400);
    if (bio.length > 500) return json({ error: "BIO_TOO_LONG" }, 400);
    if (!Number.isFinite(gpa) || gpa < 0 || gpa > 10) return json({ error: "INVALID_GPA" }, 400);
    if (!interestIds.length) return json({ error: "INTEREST_REQUIRED" }, 400);
    if (!lookingFor.length) return json({ error: "LOOKING_FOR_REQUIRED" }, 400);

    for (const item of lookingFor) {
      const kind = String(item?.kind ?? "");
      const otherText = String(item?.other_text ?? "").trim();
      if (!allowedLookingKinds.has(kind)) return json({ error: "INVALID_LOOKING_FOR" }, 400);
      if (kind === "other" && !otherText) return json({ error: "OTHER_LOOKING_FOR_REQUIRED" }, 400);
    }

    const { data: validInterests, error: interestsError } = await admin
      .from("interests")
      .select("id")
      .in("id", interestIds);

    if (interestsError || (validInterests?.length ?? 0) !== interestIds.length) {
      return json({ error: "INVALID_INTERESTS" }, 400);
    }

    const gradeFile = decodeImage(body?.grade_file);
    if (!gradeFile) return json({ error: "GRADE_EVIDENCE_REQUIRED" }, 400);

    const avatarFile = body?.avatar_file ? decodeImage(body.avatar_file) : null;
    if (body?.avatar_file && !avatarFile) return json({ error: "INVALID_AVATAR" }, 400);

    const profilePayload = {
      id: userId,
      username,
      full_name: fullName,
      birth_date: birthDate,
      school_level: schoolLevel,
      school_name: schoolName,
      bio: bio || null,
      accepts_message_requests: acceptsMessageRequests,
      show_groups_public: false,
      show_school_public: true,
      gpa,
    };

    const { error: profileError } = await admin.from("profiles").upsert(profilePayload);
    if (profileError) return json({ error: "PROFILE_SAVE_FAILED", detail: profileError.message }, 500);

    await admin.from("profile_interests").delete().eq("profile_id", userId);
    const { error: profileInterestsError } = await admin
      .from("profile_interests")
      .insert(interestIds.map((interestId) => ({ profile_id: userId, interest_id: interestId })));
    if (profileInterestsError) return json({ error: "INTEREST_SAVE_FAILED" }, 500);

    await admin.from("profile_looking_for").delete().eq("profile_id", userId);
    const { error: lookingError } = await admin.from("profile_looking_for").insert(
      lookingFor.map((item: { kind: string; other_text?: string | null }) => ({
        profile_id: userId,
        kind: item.kind,
        other_text: item.kind === "other" ? String(item.other_text ?? "").trim() : null,
      })),
    );
    if (lookingError) return json({ error: "LOOKING_FOR_SAVE_FAILED" }, 500);

    if (avatarFile) {
      const avatarPath = `${userId}/avatar.${extensionForMime(avatarFile.mime)}`;
      const { error: avatarUploadError } = await admin.storage
        .from("avatars")
        .upload(avatarPath, avatarFile.bytes, {
          upsert: true,
          contentType: avatarFile.mime,
        });

      if (avatarUploadError) return json({ error: "AVATAR_UPLOAD_FAILED" }, 500);

      await admin.from("profiles").update({ avatar_path: avatarPath }).eq("id", userId);
    }

    const verificationId = crypto.randomUUID();
    const gradePath = `${userId}/${verificationId}.${extensionForMime(gradeFile.mime)}`;
    const { error: gradeUploadError } = await admin.storage
      .from("boletas")
      .upload(gradePath, gradeFile.bytes, {
        upsert: false,
        contentType: gradeFile.mime,
      });

    if (gradeUploadError) return json({ error: "GRADE_UPLOAD_FAILED" }, 500);

    const { error: gradeInsertError } = await admin.from("grade_verifications").insert({
      id: verificationId,
      profile_id: userId,
      gpa,
      image_path: gradePath,
      status: "pending",
    });

    if (gradeInsertError) return json({ error: "GRADE_SAVE_FAILED" }, 500);

    const nextMetadata = { ...(user.user_metadata ?? {}) };
    delete nextMetadata.application_token_hash;
    delete nextMetadata.application_token_expires_at;
    nextMetadata.full_name = fullName;

    await admin.auth.admin.updateUserById(userId, { user_metadata: nextMetadata });

    const notifyResponse = await fetch(`${supabaseUrl}/functions/v1/notify-signup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId }),
    });

    return json({
      ok: true,
      notification_sent: notifyResponse.ok,
      email_confirmed: Boolean(user.email_confirmed_at),
    });
  } catch (error) {
    return json({
      error: "UNEXPECTED_ERROR",
      detail: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

function decodeImage(input: unknown): { bytes: Uint8Array; mime: string } | null {
  if (!input || typeof input !== "object") return null;

  const candidate = input as { mime?: unknown; base64?: unknown };
  const mime = String(candidate.mime ?? "");
  const base64 = String(candidate.base64 ?? "");

  if (!allowedMime.has(mime) || !base64) return null;

  try {
    const binary = atob(base64);
    if (binary.length > 5 * 1024 * 1024) return null;

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    return { bytes, mime };
  } catch {
    return null;
  }
}

function extensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function calculateAge(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
