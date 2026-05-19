-- Fix RAG ingestion when the existing Supabase `chunks` table was created
-- before the application started writing the full chunk payload expected by
-- the app: chunk_index, chunk_text, token_count and embedding.
alter table public.chunks
  add column if not exists chunk_index integer;

alter table public.chunks
  add column if not exists chunk_text text;

alter table public.chunks
  add column if not exists token_count integer;

alter table public.chunks
  add column if not exists embedding jsonb;

with numbered_chunks as (
  select
    id,
    row_number() over (partition by document_id order by id) - 1 as generated_chunk_index
  from public.chunks
  where chunk_index is null
)
update public.chunks
set chunk_index = numbered_chunks.generated_chunk_index
from numbered_chunks
where public.chunks.id = numbered_chunks.id;

update public.chunks
set chunk_text = ''
where chunk_text is null;

alter table public.chunks
  alter column chunk_index set default 0;

alter table public.chunks
  alter column chunk_index set not null;

alter table public.chunks
  alter column chunk_text set not null;

create unique index if not exists chunks_document_id_chunk_index_key
  on public.chunks (document_id, chunk_index);

create index if not exists chunks_document_id_idx
  on public.chunks (document_id);

-- Supabase/PostgREST keeps a schema cache. Reload it after DDL so inserts can
-- immediately see the new column.
notify pgrst, 'reload schema';
