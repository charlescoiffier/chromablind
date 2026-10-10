import io,json
import pytest
from fastapi.testclient import TestClient
from PIL import ImageCms
from pypdf import PdfReader
from server.app import app
client=TestClient(app)
def document():
 return {'version':1,'generator':'packing-1','name':'Épreuve','geometry':{'width':180,'height':180},'background':'#ffffff','colors':[{'space':'XYZ-D65','xyz':[.95047,1,1.08883]},{'space':'XYZ-D65','xyz':[.4124564,.2126729,.0193339]}],'disks':[{'x':30,'y':40,'r':5,'color':1}]}
def icc(): return ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
def test_explicit_profile_required():
 assert client.post('/api/export/pdf',data={'document':json.dumps(document())}).status_code==422

def test_profiled_vector_pdf():
 response=client.post('/api/export/pdf',data={'document':json.dumps(document())},files={'profile':('srgb.icc',icc(),'application/octet-stream')})
 assert response.status_code==200,response.text
 reader=PdfReader(io.BytesIO(response.content)); page=reader.pages[0]
 assert float(page.mediabox.width)==pytest.approx(180*72/25.4,abs=.001)
 profile=reader.trailer['/Root']['/OutputIntents'][0]['/DestOutputProfile']
 assert profile.get_data()==icc()
 assert page['/Resources']['/ColorSpace']['/Destination'][0]=='/ICCBased'
 assert sum(line.endswith(b' c') for line in page.get_contents().get_data().splitlines())==4
 assert response.headers['x-pdf-conformance']=='profiled-pdf-not-pdfx'

def test_invalid_profiles_and_nonfinite_disks():
 response=client.post('/api/export/pdf',data={'document':json.dumps(document())},files={'profile':('bad.icc',b'no','application/octet-stream')}); assert response.status_code==422
 d=document();d['disks'][0]['r']=-1
 assert client.post('/api/export/pdf',data={'document':json.dumps(d)},files={'profile':('s.icc',icc())}).status_code==422

def test_proof_reports_converted_colors_and_errors():
 response=client.post('/api/proof',data={'document':json.dumps(document())},files={'profile':('s.icc',icc())})
 assert response.status_code==200,response.text
 result=response.json(); assert len(result['colors'])==2;assert max(result['deltaE'])<1
 assert all(not x for x in result['outOfGamut'])

def test_catalogue_is_documented_and_identifiers_are_not_paths():
 data=client.get('/api/profiles').json();assert data['profiles'];assert all('source' in p and 'description' in p for p in data['profiles'])
 assert client.post('/api/export/pdf',data={'document':json.dumps(document()),'profile_id':'../../etc/passwd'}).status_code==422

def test_cmyk_profiles_are_real_output_profiles_and_conversion_is_not_quantized():
 from server.color_engine import transform_palette
 profile_data=(__import__('pathlib').Path(__file__).parent/'profiles/fogra39-vigc.icc').read_bytes()
 values=transform_palette([(0.401,0.3,0.2),(0.4011,0.3,0.2)],profile_data,'CMYK')
 assert len(values[0])==4
 assert all(0<=v<=1 for row in values for v in row)
 assert values[0]!=values[1]
 response=client.post('/api/export/pdf',data={'document':json.dumps(document()),'profile_id':'fogra39-vigc'})
 assert response.status_code==200,response.text
 reader=PdfReader(io.BytesIO(response.content));assert reader.trailer['/Root']['/OutputIntents'][0]['/DestOutputProfile']['/N']==4
 proof=client.post('/api/proof',data={'document':json.dumps(document()),'profile_id':'fogra47-vigc'})
 assert proof.status_code==200,proof.text
 assert proof.json()['precision']=='float64'

def test_large_valid_project_field_and_upload_limit():
 d=document();d['padding']='x'*1_200_000
 response=client.post('/api/export/pdf',data={'document':json.dumps(d),'profile_id':'srgb-reference'})
 assert response.status_code==200,response.text
 response=client.post('/api/export/pdf',data={'document':json.dumps(document())},files={'profile':('large.icc',b'x'*5_000_001)})
 assert response.status_code==413

def test_master_cmyk_numbers_are_preserved_in_pdf_and_profile_changes_are_explicit():
 import hashlib
 from pathlib import Path
 from server.app import export_values,project
 data=Path('server/profiles/fogra39-vigc.icc').read_bytes()
 d=document()
 d['colors'][0]['cmyk']=[0,0,0,0]
 d['colors'][1]['cmyk']=[.1234,.4567,.2345,.0678]
 d['print']={'profile':'fogra39-vigc','sha256':hashlib.sha256(data).hexdigest(),'background':[0,0,0,0]}
 parsed=project(json.dumps(d))
 assert export_values(parsed,data,'CMYK')[1]==tuple(d['colors'][1]['cmyk'])
 response=client.post('/api/export/pdf',data={'document':json.dumps(d),'profile_id':'fogra39-vigc'})
 assert response.status_code==200,response.text
 reader=PdfReader(io.BytesIO(response.content))
 content=reader.pages[0].get_contents().get_data()
 assert b'0.1234 0.4567 0.2345 0.0678 scn' in content
 assert reader.pages[0]['/Resources']['/ColorSpace']['/Destination'][1]['/N']==4
 proof=client.post('/api/proof',data={'document':json.dumps(d),'profile_id':'fogra39-vigc'})
 assert proof.status_code==200,proof.text
 assert max(proof.json()['deltaE'])<1e-8
 assert client.post('/api/export/pdf',data={'document':json.dumps(d),'profile_id':'srgb-reference'}).status_code==422
 d['print']['sha256']='bad'
 assert client.post('/api/export/pdf',data={'document':json.dumps(d),'profile_id':'fogra39-vigc'}).status_code==422

def test_browser_interpolation_tables_track_the_native_reference():
 import struct,random,itertools
 from pathlib import Path
 from server.color_engine import Session,RGB,CMYK
 def table(name):
  raw=Path('public/color/'+name+'.bin').read_bytes()
  return struct.unpack('<'+'f'*(len(raw)//4),raw)
 def interpolate(data,values,grid,channels):
  coords=[v*(grid-1) for v in values];low=[min(grid-2,int(v)) for v in coords];fracs=[v-l for v,l in zip(coords,low)]
  result=[0]*channels
  for bits in itertools.product((0,1),repeat=len(values)):
   weight=1;index=0
   for axis,bit in enumerate(bits):
    weight*=fracs[axis] if bit else 1-fracs[axis];index=index*grid+low[axis]+bit
   for c in range(channels):result[c]+=weight*data[index*channels+c]
  return result
 rng=random.Random(831)
 # Use printable ink totals <=260%, including black combinations, without requiring display gamut coverage.
 inks=[]
 for _ in range(100):
  row=[rng.random() for _ in range(4)]
  if sum(row)>2.6:row=[v*2.6/sum(row) for v in row]
  inks.append(row)
 data=Path('server/profiles/fogra39-vigc.icc').read_bytes()
 with Session(data) as s:
  reference=s.transform([[v*100 for v in row] for row in inks],s.destination,CMYK,s.source,RGB,3)
 rgbtable=table('cmyk-rgb')
 differences=[abs(a-b) for row,expected in zip(inks,reference) for a,b in zip(interpolate(rgbtable,row,17,3),expected)]
 assert max(differences)<.035
 # Grid-node conversion numbers are directly those of LittleCMS, not a generic algebraic CMYK formula.
 with Session(data) as s:
  reference=s.transform([(0.5,0.25,0.75)],s.source,RGB,s.destination,CMYK,4)[0]
 assert interpolate(table('rgb-cmyk'),[.5,.25,.75],33,4)==pytest.approx([v/100 for v in reference],abs=1e-7)

def test_health_reports_installed_color_engine():
 response=client.get('/api/health')
 assert response.status_code==200
 assert response.json()['status']=='ok'
 assert response.json()['colorEngine'].startswith('LittleCMS ')
 assert response.json()['colorEngine']!='LittleCMS None'
