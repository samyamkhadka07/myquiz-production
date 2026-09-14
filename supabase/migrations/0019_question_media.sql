begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('question-media','question-media',false,20971520,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.media_assets(
 id uuid primary key default gen_random_uuid(),uploaded_by uuid not null references public.profiles(id),upload_key uuid not null,
 bucket text not null default 'question-media' check(bucket='question-media'),object_path text not null unique,original_filename text not null,
 mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp','image/svg+xml')),byte_size bigint not null check(byte_size>0 and byte_size<=20971520),
 checksum_sha256 text,default_alt_text text not null,version integer not null default 1 check(version>0),replaces_id uuid references public.media_assets(id),
 status text not null default 'UPLOADING' check(status in ('UPLOADING','ACTIVE','ARCHIVED')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(uploaded_by,upload_key),check(original_filename !~ '[/\\[:cntrl:]]' and length(original_filename) between 1 and 255)
);
create table public.question_media_links(
 question_id uuid not null references public.questions(id) on delete cascade,media_id uuid not null references public.media_assets(id),position integer not null default 0 check(position>=0),
 alt_text text not null,caption text,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),primary key(question_id,media_id),unique(question_id,position)
);
create index media_assets_status_created_idx on public.media_assets(status,created_at desc);
create index question_media_links_media_idx on public.question_media_links(media_id);

alter table public.media_assets enable row level security;
alter table public.question_media_links enable row level security;
create policy media_staff_select on public.media_assets for select to authenticated using(is_staff());
create policy media_published_select on public.media_assets for select to authenticated using(status='ACTIVE' and exists(select 1 from public.question_media_links l join public.questions q on q.id=l.question_id where l.media_id=media_assets.id and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED'));
create policy media_links_staff on public.question_media_links for select to authenticated using(is_staff());
create policy media_links_published on public.question_media_links for select to authenticated using(exists(select 1 from public.questions q where q.id=question_id and q.verification_status='VERIFIED' and q.publication_status='PUBLISHED'));

create policy question_media_object_insert on storage.objects for insert to authenticated with check(bucket_id='question-media' and exists(select 1 from public.media_assets m where m.object_path=name and m.uploaded_by=auth.uid() and m.status='UPLOADING'));

create function public.create_media_asset(p_filename text,p_mime text,p_size bigint,p_alt text,p_request uuid) returns public.media_assets language plpgsql security definer set search_path=public,pg_temp as $$
declare result media_assets;mid uuid=gen_random_uuid();
begin
 perform require_staff();
 select * into result from media_assets where uploaded_by=auth.uid() and upload_key=p_request;
 if found then return result;end if;
 if p_request is null or p_size<=0 or p_size>20971520 or p_mime not in ('image/png','image/jpeg','image/webp','image/svg+xml') or length(trim(p_alt))<3 or p_filename~'[/\\[:cntrl:]]' then raise exception 'Unsupported media metadata';end if;
 insert into media_assets(id,uploaded_by,upload_key,object_path,original_filename,mime_type,byte_size,default_alt_text)
 values(mid,auth.uid(),p_request,'question-media/'||mid||'/'||p_filename,p_filename,p_mime,p_size,trim(p_alt)) returning * into result;
 insert into audit_events(actor_id,action,target_type,target_id) values(auth.uid(),'MEDIA_UPLOAD_STARTED','media_asset',mid::text);
 return result;
end $$;

create function public.finalize_media_asset(p_id uuid,p_user uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m media_assets;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server validation required' using errcode='42501';end if;
 select * into m from media_assets where id=p_id and uploaded_by=p_user for update;
 if not found then raise exception 'Media asset not found';end if;
 if not exists(select 1 from storage.objects where bucket_id=m.bucket and name=m.object_path) then raise exception 'Media object is missing';end if;
 update media_assets set status='ACTIVE',updated_at=now() where id=p_id;
end $$;

create function public.set_question_media(p_question uuid,p_media uuid,p_position integer,p_alt text,p_caption text default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform require_staff();
 if not exists(select 1 from media_assets where id=p_media and status='ACTIVE') then raise exception 'Active media asset not found';end if;
 insert into question_media_links(question_id,media_id,position,alt_text,caption,created_by) values(p_question,p_media,p_position,trim(p_alt),nullif(trim(p_caption),''),auth.uid())
 on conflict(question_id,media_id) do update set position=excluded.position,alt_text=excluded.alt_text,caption=excluded.caption;
 update questions set lifecycle='STAGED',verification_status='UNVERIFIED',publication_status='DRAFT',verified_by=null,verified_at=null,published_at=null,updated_at=now() where id=p_question;
 insert into audit_events(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'QUESTION_MEDIA_LINKED','question',p_question::text,jsonb_build_object('media_id',p_media));
end $$;

create function public.remove_question_media(p_question uuid,p_media uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform require_staff();delete from question_media_links where question_id=p_question and media_id=p_media;if found then update questions set lifecycle='STAGED',verification_status='UNVERIFIED',publication_status='DRAFT',verified_by=null,verified_at=null,published_at=null,updated_at=now() where id=p_question;end if;end $$;

grant select on public.media_assets,public.question_media_links to authenticated;
grant execute on function public.create_media_asset(text,text,bigint,text,uuid),public.set_question_media(uuid,uuid,integer,text,text),public.remove_question_media(uuid,uuid) to authenticated;
grant execute on function public.finalize_media_asset(uuid,uuid) to service_role;
grant all on public.media_assets,public.question_media_links to service_role;
commit;
