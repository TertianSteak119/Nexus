export type SchoolLevel = 'secundaria' | 'preparatoria' | 'universidad'
export type LookingForKind = 'friends' | 'projects' | 'study_groups' | 'other'

export type Profile = {
  id: string
  username: string
  full_name: string
  avatar_path: string | null
  bio: string | null
  birth_date: string
  school_level: SchoolLevel
  school_name: string
  gpa: number | null
  gpa_verified: boolean
  accepts_message_requests: boolean
  role: 'user' | 'moderator'
  status: 'active' | 'suspended' | 'banned'
  created_at: string
  updated_at: string
}