import json,urllib.request,os,sys,io,re
from PIL import Image, ImageOps
env={}
for l in open(os.path.expanduser('~/PejabatAra/.env.local')):
    if '=' in l and not l.startswith('#'):
        k,v=l.strip().split('=',1); env[k]=v.strip('"\'')
U=env.get('SUPABASE_URL') or env.get('VITE_SUPABASE_URL'); K=env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_SERVICE_KEY')
H={'apikey':K,'Authorization':'Bearer '+K}
def get(p): return json.load(urllib.request.urlopen(urllib.request.Request(U+'/rest/v1/'+p,headers=H)))
emps=get("hr_employees?select=id,company,employee_code,full_name,assessment_staff_id,status&status=eq.Active&limit=400")
st={s['id']:s['name'] for s in get("assessment_staff?select=id,name&limit=500")}
def short(e): return (st.get(e['assessment_staff_id']) or e['full_name'].split()[0]).lower().replace(' ','')
dirs=[('/Users/asyrafsahar/Desktop/Gambar staf',False),('/tmp/orgchart/mgmt',True)]
rows=[]
for d,_ in dirs:
    for f in sorted(os.listdir(d)):
        if d.endswith('mgmt'):
            hits=[e for e in emps+get("hr_employees?select=id,company,employee_code,full_name,assessment_staff_id,status&employee_code=eq."+f.split('.')[0]) if e['employee_code']==f.split('.')[0]][:1]
            rows.append((os.path.join(d,f),hits,'')); continue
        m=re.match(r'^(.+?)\s+(KJ|SK)\.(jpe?g|png)$',f,re.I)
        if not m: rows.append((f,None,'bad name')); continue
        n=m.group(1).lower().replace(' ',''); c=m.group(2).upper()
        hits=[e for e in emps if e['company']==c and (short(e)==n or e['full_name'].lower().replace(' ','').startswith(n))]
        rows.append((os.path.join(d,f),hits,''))
def bucket():
    req=urllib.request.Request(U+'/storage/v1/bucket',data=json.dumps({'id':'staff-photos','name':'staff-photos','public':False,'file_size_limit':409600,'allowed_mime_types':['image/jpeg']}).encode(),method='POST',headers={**H,'Content-Type':'application/json'})
    try: urllib.request.urlopen(req); print('bucket created (private)')
    except urllib.error.HTTPError as x: print('bucket:',x.code,x.read()[:100])
mode=sys.argv[1] if len(sys.argv)>1 else 'preview'
if mode=='upload': bucket()
for path,hits,err in rows:
    f=os.path.basename(path)
    if err or len(hits)!=1: print('?? ',f,'->',[h['full_name'] for h in hits or []] or err); continue
    e=hits[0]
    print('OK ',f.ljust(22),'->',e['company'],e['employee_code'].ljust(11),e['full_name'])
    if mode=='upload':
        im=ImageOps.exif_transpose(Image.open(path)).convert('RGB'); w,h=im.size
        if h>w*1.3 and not path.endswith('mgmt'): s=int(w*0.78); top=int(max(0,min(h-s,h*0.25-s/2)))   # tall photo: face is in the top part
        else: s=min(w,h); top=max(0,min(h-s,(h-s)//2))
        left=(w-s)//2; im=im.crop((left,top,left+s,top+s)).resize((256,256),Image.LANCZOS)
        if os.environ.get('SHEET'): im.save('/tmp/orgchart/crops/'+os.path.basename(path)+'.png')
        b=io.BytesIO(); im.save(b,'JPEG',quality=86,optimize=True); data=b.getvalue()  # no EXIF kept
        src=ImageOps.exif_transpose(Image.open(path)).convert('RGB'); src.thumbnail((900,900),Image.LANCZOS); sb=io.BytesIO(); src.save(sb,'JPEG',quality=85,optimize=True)
        try: urllib.request.urlopen(urllib.request.Request(U+'/storage/v1/object/staff-photos/%s.src.jpg'%e['id'],data=sb.getvalue(),method='POST',headers={**H,'Content-Type':'image/jpeg','x-upsert':'true'}))
        except urllib.error.HTTPError as x: print('    SRC FAIL',x.code)
        req=urllib.request.Request(U+'/storage/v1/object/staff-photos/%s.jpg'%e['id'],data=data,method='POST',headers={**H,'Content-Type':'image/jpeg','x-upsert':'true'})
        try: urllib.request.urlopen(req); print('    saved',len(data),'bytes')
        except urllib.error.HTTPError as x: print('    FAIL',x.code,x.read()[:120])
