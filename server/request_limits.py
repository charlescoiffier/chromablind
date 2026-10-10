"""Bound requests and keep accepted multipart profiles entirely in RAM."""
from fastapi import Request,HTTPException
from starlette.formparsers import MultiPartParser,MultiPartException,FormParser
from starlette.datastructures import UploadFile

MAX_BODY=14_000_000
MAX_PROFILE=5_000_000
MAX_PROJECT=8_000_000
class MemoryMultipartParser(MultiPartParser):
 spool_max_size=MAX_BODY
 def on_part_begin(self):
  super().on_part_begin();self.received_file_bytes=0
 def on_part_data(self,data,start,end):
  if self._current_part.file is not None:
   self.received_file_bytes+=end-start
   if self.received_file_bytes>MAX_PROFILE:raise MultiPartException('Profil ICC limité à 5 Mo.')
  super().on_part_data(data,start,end)

class BodyLimitMiddleware:
 def __init__(self,app):self.app=app
 async def __call__(self,scope,receive,send):
  if scope['type']!='http':return await self.app(scope,receive,send)
  total=0
  async def bounded():
   nonlocal total
   message=await receive();total+=len(message.get('body',b''))
   if total>MAX_BODY:raise HTTPException(413,'Requête limitée à 14 Mo.')
   return message
  await self.app(scope,bounded,send)

async def export_input(request:Request):
 content=request.headers.get('content-type','')
 if content.startswith('multipart/form-data'):
  parser=MemoryMultipartParser(request.headers,request.stream(),max_files=1,max_fields=2,max_part_size=MAX_PROJECT)
 elif content.startswith('application/x-www-form-urlencoded'):parser=FormParser(request.headers,request.stream(),max_fields=2,max_part_size=MAX_BODY)
 else:raise HTTPException(415,'Utilisez un formulaire multipart ou URL-encodé.')
 try:form=await parser.parse()
 except MultiPartException as e:raise HTTPException(413 if 'limité' in str(e) or 'size' in str(e) else 422,str(e))
 try:
  if any(key not in ('document','profile','profile_id') for key in form) or any(len(form.getlist(key))!=1 for key in form):raise HTTPException(422,'Champs de formulaire invalides.')
  raw=form.get('document');upload=form.get('profile');identifier=form.get('profile_id')
  if not isinstance(raw,str) or upload is not None and not isinstance(upload,UploadFile) or identifier is not None and not isinstance(identifier,str):raise HTTPException(422,'Document ou profil manquant/invalide.')
  yield raw,upload,identifier
 finally:await form.close()
