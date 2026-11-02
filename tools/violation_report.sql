-- Read-only: every distinct finding of the DCAT-AP, GeoDCAT-AP and HVD checks across all datasets, most widespread first.
--   sudo -u postgres psql -d dashboard_db -P pager=off -f tools/violation_report.sql
-- Reads the per-dataset cache rows (result_json -> result -> details); one entry per distinct (message, path) per
-- dataset, so `datasets` is how many datasets have that finding and `hits` how many times it fires in total
-- (e.g. once per distribution). `path` is the end of the RDF property IRI the rule checks.
with v as (
    select 'dcat' as k, e from dcat_ap_dataset_check_cache c,
        jsonb_array_elements((c.result_json::jsonb) -> 'result' -> 'details') e
    union all
    select 'geodcat', e from geodcat_dataset_check_cache c,
        jsonb_array_elements((c.result_json::jsonb) -> 'result' -> 'details') e
    union all
    select 'hvd', e from hvd_dataset_check_cache c,
        jsonb_array_elements((c.result_json::jsonb) -> 'result' -> 'details') e
), g as (
    select k,
           e ->> 'severity'                                  as sev,
           right(coalesce(e ->> 'path', ''), 36)             as path,
           left(coalesce(e ->> 'message', ''), 95)           as message,
           count(*)                                          as datasets,
           sum(coalesce((e ->> 'count')::int, 1))            as hits
    from v
    group by 1, 2, 3, 4
), r as (
    select *, row_number() over (partition by k order by datasets desc, hits desc) as rn from g
)
select k, sev, path, message, datasets, hits
from r
where rn <= 25
order by k, datasets desc, hits desc;
