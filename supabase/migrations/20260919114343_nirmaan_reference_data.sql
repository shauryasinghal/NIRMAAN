-- Controlled vocabularies (not demo data). Idempotent.
insert into public.interests (slug, name) values
  ('ai-ml','AI/ML'),('climatetech','ClimateTech'),('cloud','Cloud'),('cybersecurity','Cybersecurity'),
  ('data-science','Data Science'),('devops','DevOps'),('edtech','EdTech'),('fintech','FinTech'),
  ('healthtech','HealthTech'),('open-innovation','Open Innovation'),('web-development','Web Development')
on conflict (slug) do nothing;

insert into public.skills (slug, name) values
  ('api-design','api design'),('c++','c++'),('cloud','cloud'),('css','css'),('cybersecurity','cybersecurity'),
  ('data-science','data science'),('deep-learning','deep learning'),('devops','devops'),('docker','docker'),
  ('figma','figma'),('git','git'),('iot','iot'),('java','java'),('javascript','javascript'),
  ('machine-learning','machine learning'),('networking','networking'),('nlp','nlp'),('python','python'),
  ('react','react'),('sql','sql'),('system-design','system design'),('typescript','typescript'),('ui-ux','ui/ux')
on conflict (slug) do nothing;
