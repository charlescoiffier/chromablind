"""In-memory vector exports. No PDF/X conformance claimed without a validator."""
import io,json,math,os,hashlib
from pathlib import Path
from typing import Annotated
import pydyf
from PIL import ImageCms,features
from .color_engine import transform_palette,proof_palette,transform_cmyk_palette,proof_cmyk_palette
from fastapi import FastAPI,Depends,UploadFile,HTTPException
from starlette.concurrency import run_in_threadpool
from .request_limits import BodyLimitMiddleware,export_input
from fastapi.responses import Response
from pydantic import BaseModel,Field,ConfigDict,ValidationError,field_validator

app=FastAPI(title='chromablind — exports',docs_url=None,redoc_url=None)
app.add_middleware(BodyLimitMiddleware)
MAX_PROFILE=5_000_000
MAX_PROJECT=8_000_000
PROFILES=Path(os.environ.get('CHROMATIQUE_PROFILES',Path(__file__).parent/'profiles'))
SRGB=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))

class Color(BaseModel):
 space:str
 cmyk:list[float]|None=Field(default=None,min_length=4,max_length=4)
 xyz:list[float]=Field(min_length=3,max_length=3)
 @field_validator('cmyk')
 @classmethod
 def inks(cls,v):
  if v is not None and any(not math.isfinite(x) or not 0<=x<=1 for x in v):raise ValueError('CMJN invalides')
  return v
 @field_validator('xyz')
 @classmethod
 def coordinates(cls,v):
  if any(not math.isfinite(x) or not -.1<=x<=2 for x in v):raise ValueError('Coordonnées XYZ invalides')
  return v
 @field_validator('space')
 @classmethod
 def space_name(cls,v):
  if v!='XYZ-D65':raise ValueError('Espace non pris en charge')
  return v
class Disk(BaseModel):
 x:float=Field(ge=0,le=2000);y:float=Field(ge=0,le=2000);r:float=Field(gt=0,le=100);color:int=Field(ge=0,le=63)
 model_config=ConfigDict(allow_inf_nan=False)
class Geometry(BaseModel):
 width:float=Field(ge=10,le=2000);height:float=Field(ge=10,le=2000)
 model_config=ConfigDict(allow_inf_nan=False)
class PrintReference(BaseModel):
 space:str="CMYK"
 profile:str;sha256:str;background:list[float]=Field(min_length=4,max_length=4)
 @field_validator('background')
 @classmethod
 def inks(cls,v):
  if any(not math.isfinite(x) or not 0<=x<=1 for x in v):raise ValueError('CMJN invalides')
  return v
class Project(BaseModel):
 print:PrintReference|None=None
 version:int;generator:str;name:str=Field(max_length=150);geometry:Geometry;background:str
 colors:list[Color]=Field(min_length=1,max_length=64)
 disks:list[Disk]=Field(max_length=20000)
 @field_validator('background')
 @classmethod
 def background_color(cls,v):
  import re
  if not re.fullmatch(r'#[0-9a-fA-F]{6}',v):raise ValueError('Fond invalide')
  return v

def project(raw:str):
 if len(raw.encode())>MAX_PROJECT:raise HTTPException(413,'Projet limité à 8 Mo.')
 try:
  d=Project.model_validate_json(raw)
  if d.version!=1 or d.generator!='packing-1':raise ValueError('Version de projet invalide.')
  if d.print:
   master=(PROFILES/'fogra39-vigc.icc').read_bytes()
   if d.print.space!='CMYK' or d.print.profile!='fogra39-vigc' or d.print.sha256!=hashlib.sha256(master).hexdigest() or any(c.cmyk is None for c in d.colors):raise ValueError('Référence CMJN invalide.')
  for c in d.disks:
   if c.color>=len(d.colors) or c.x-c.r<-.001 or c.y-c.r<-.001 or c.x+c.r>d.geometry.width+.001 or c.y+c.r>d.geometry.height+.001:raise ValueError('Disque hors support ou couleur invalide.')
  return d
 except (ValidationError,ValueError):raise HTTPException(422,'Projet invalide : vérifiez dimensions, disques et couleurs.')

def catalogue():
 entries=[]
 if PROFILES.exists():
  for metadata in sorted(PROFILES.glob('*.json')):
   try:
    item=json.loads(metadata.read_text());filename=PROFILES/(metadata.stem+'.icc')
    if filename.exists():entries.append({'id':metadata.stem,**{k:item[k] for k in ['name','description','source']}})
   except (ValueError,KeyError):continue
 # No generic print profile: explicitly named RGB reference for qualification.
 entries.append({'id':'srgb-reference','name':'sRGB — référence RVB','description':'Profil RVB de référence, pas un profil papier. Pour qualifier la chaîne ou livrer un PDF RVB profilé.','source':'LittleCMS / IEC 61966-2-1'})
 return entries

async def read_profile(upload:UploadFile|None,identifier:str|None):
 if upload is not None and identifier:raise HTTPException(422,'Choisissez un profil du catalogue OU un fichier ICC.')
 if upload is not None:
  data=await upload.read(MAX_PROFILE+1)
  if len(data)>MAX_PROFILE:raise HTTPException(413,'Profil ICC limité à 5 Mo.')
 elif identifier=='srgb-reference':data=SRGB.tobytes()
 elif identifier and identifier in {i['id'] for i in catalogue()}:
  data=(PROFILES/(identifier+'.icc')).read_bytes()
 else:raise HTTPException(422,'Sélectionnez explicitement un profil ICC.')
 if len(data)<128 or data[36:40]!=b'acsp' or int.from_bytes(data[:4],'big')!=len(data):raise HTTPException(422,'En-tête ICC invalide.')
 try:
  profile=ImageCms.ImageCmsProfile(io.BytesIO(data));space=profile.profile.xcolor_space.strip()
  if space not in ('RGB','CMYK'):raise ValueError('Espace non pris en charge')
  if profile.profile.device_class.strip() not in ('mntr','prtr','spac'):raise ValueError('Classe de profil non prise en charge')
  mode='RGB' if space=='RGB' else 'CMYK'
  ImageCms.buildTransform(SRGB,profile,'RGB',mode,renderingIntent=1)
  return data,profile,mode
 except Exception:raise HTTPException(422,'Profil ICC incompatible. Fournissez un profil RGB ou CMJN utilisable pour la conversion.')

RGB_FROM_XYZ=((3.2404542,-1.5371385,-.4985314),(-.969266,1.8760108,.041556),(.0556434,-.2040259,1.0572252))
def encode(v):return 12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055

def colors_rgb(d):
 colors=[]
 for c in d.colors:
  rgb=[encode(sum(row[i]*c.xyz[i] for i in range(3))) for row in RGB_FROM_XYZ]
  if any(v<-.0001 or v>1.0001 for v in rgb):raise HTTPException(422,'Une couleur maître est hors gamut sRGB. Corrigez la palette avant conversion.')
  colors.append(tuple(max(0,min(1,v)) for v in rgb))
 colors.append(tuple(int(d.background[i:i+2],16)/255 for i in (1,3,5)))
 return colors

def master_data(d):return (PROFILES/'fogra39-vigc.icc').read_bytes()
def cmyk_values(d):return [tuple(c.cmyk) for c in d.colors]+[tuple(d.print.background)]
def export_values(d,data,mode):
 if d.print:
  if mode!='CMYK':raise HTTPException(422,'Un projet CMJN nécessite un profil de sortie CMJN.')
  return transform_cmyk_palette(cmyk_values(d),master_data(d),data,mode)
 return transform_palette(colors_rgb(d),data,mode)

def proof_result(d,data,profile,mode):
 if d.print:
  if mode!='CMYK':raise HTTPException(422,'Un projet CMJN nécessite un profil de sortie CMJN.')
  shown,reconstructed,errors=proof_cmyk_palette(cmyk_values(d),master_data(d),data,mode)
 else:shown,reconstructed,errors=proof_palette(colors_rgb(d),data,mode)
 warnings=['Épreuve écran approximative ; une épreuve physique reste nécessaire.']
 if mode=='RGB':warnings.append('Profil RVB sélectionné : il ne caractérise pas nécessairement un procédé d’impression.')
 if max(errors,default=0)>3:warnings.append('Certaines couleurs changent sensiblement après conversion ; vérifiez l’effet perceptif.')
 return {'colors':shown[:-1],'relativeColors':reconstructed[:-1],'deltaE':errors[:-1],'outOfGamut':[e>3 for e in errors[:-1]],'profile':ImageCms.getProfileDescription(profile).strip(),'warnings':warnings,'gamutMethod':'heuristique ΔE76 > 3, pas une mesure exacte du gamut','precision':'float64','background':shown[-1]}

def make_pdf(d,data,profile,mode):
 values=export_values(d,data,mode)
 pdf=pydyf.PDF();n=3 if mode=='RGB' else 4
 icc=pydyf.Stream([data],extra={'N':n},compress=True);pdf.add_object(icc)
 intent=pydyf.Dictionary({'Type':'/OutputIntent','S':'/GTS_PDFX','OutputConditionIdentifier':pydyf.String(ImageCms.getProfileDescription(profile).strip()),'Info':pydyf.String('ICC conversion: relative colorimetric, black point compensation'),'DestOutputProfile':icc.reference});pdf.add_object(intent)
 pdf.catalog['OutputIntents']=pydyf.Array([intent.reference])
 stream=pydyf.Stream(compress=True);stream.set_color_space('Destination')
 pt=72/25.4;w,h=d.geometry.width*pt,d.geometry.height*pt
 stream.set_color_special(None,False,*values[-1]);stream.rectangle(0,0,w,h);stream.fill()
 k=.5522847498307936
 for c in d.disks:
  stream.set_color_special(None,False,*values[c.color])
  x,y,r=c.x*pt,h-c.y*pt,c.r*pt;a=r*k
  stream.move_to(x+r,y);stream.curve_to(x+r,y+a,x+a,y+r,x,y+r);stream.curve_to(x-a,y+r,x-r,y+a,x-r,y);stream.curve_to(x-r,y-a,x-a,y-r,x,y-r);stream.curve_to(x+a,y-r,x+r,y-a,x+r,y);stream.close();stream.fill()
 pdf.add_object(stream)
 resources=pydyf.Dictionary({'ColorSpace':pydyf.Dictionary({'Destination':pydyf.Array(['/ICCBased',icc.reference])})})
 page=pydyf.Dictionary({'Type':'/Page','Parent':pdf.pages.reference,'MediaBox':pydyf.Array([0,0,w,h]),'Resources':resources,'Contents':stream.reference});pdf.add_page(page)
 pdf.info['Title']=pydyf.String(d.name);pdf.info['Creator']=pydyf.String('chromablind — PDF profilé, conformité PDF/X non vérifiée')
 output=io.BytesIO();pdf.write(output,version=b'1.7');return output.getvalue()

@app.get('/api/health')
def health():return {'status':'ok','colorEngine':'LittleCMS '+features.version("littlecms2"),'pdfConformance':'profiled-pdf-not-pdfx'}
@app.get('/api/profiles')
def profiles():return {'profiles':catalogue()}
@app.post('/api/proof')
async def proof(payload:Annotated[tuple,Depends(export_input)]):
 document,profile,profile_id=payload
 d=project(document);data,p,mode=await read_profile(profile,profile_id)
 try:return await run_in_threadpool(proof_result,d,data,p,mode)
 except HTTPException:raise
 except Exception:raise HTTPException(422,'Impossible d’épreuver avec ce profil. Vérifiez les tables ICC.')
@app.post('/api/export/pdf')
async def pdf_export(payload:Annotated[tuple,Depends(export_input)]):
 document,profile,profile_id=payload
 d=project(document);data,p,mode=await read_profile(profile,profile_id)
 try:pdf=await run_in_threadpool(make_pdf,d,data,p,mode)
 except HTTPException:raise
 except Exception:raise HTTPException(422,'Conversion PDF impossible avec ce profil.')
 return Response(pdf,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="chromablind.pdf"','X-PDF-Conformance':'profiled-pdf-not-pdfx','Cache-Control':'no-store'})
