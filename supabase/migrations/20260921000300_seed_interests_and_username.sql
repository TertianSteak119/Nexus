alter table public.profiles drop constraint if exists profiles_username_check;

alter table public.profiles
  add constraint profiles_username_check
  check (
    char_length(trim(username)) between 3 and 30
    and username = trim(username)
  );

insert into public.interests (name) values
  ('Arte'),
  ('Música'),
  ('Programación'),
  ('Lectura'),
  ('Deportes'),
  ('Videojuegos'),
  ('Ciencia'),
  ('Fotografía'),
  ('Dibujo'),
  ('Danza'),
  ('Cine'),
  ('Idiomas'),
  ('Emprendimiento'),
  ('Voluntariado')
on conflict (name) do nothing;