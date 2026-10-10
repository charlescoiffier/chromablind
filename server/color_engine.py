"""LittleCMS double-precision transforms. CMYK doubles use percent units."""
import ctypes as C
import ctypes.util
from contextlib import ExitStack
from PIL import _imagingcms

# The container ships liblcms2; Pillow's bundled copy is a macOS fallback.
lib=C.CDLL(ctypes.util.find_library('lcms2') or _imagingcms.__file__)
PTR=C.c_void_p;U32=C.c_uint32

def bind(name,args,result):
 f=getattr(lib,name);f.argtypes=args;f.restype=result;return f
open_profile=bind('cmsOpenProfileFromMem',[PTR,U32],PTR)
close_profile=bind('cmsCloseProfile',[PTR],C.c_int)
srgb_profile=bind('cmsCreate_sRGBProfile',[],PTR)
lab_profile=bind('cmsCreateLab4Profile',[PTR],PTR)
create_transform=bind('cmsCreateTransform',[PTR,U32,PTR,U32,U32,U32],PTR)
create_proof=bind('cmsCreateProofingTransform',[PTR,U32,PTR,U32,PTR,U32,U32,U32],PTR)
delete_transform=bind('cmsDeleteTransform',[PTR],None)
do_transform=bind('cmsDoTransform',[PTR,PTR,PTR,U32],None)
# lcms2.h: FLOAT_SH(1)|COLORSPACE_SH(s)|CHANNELS_SH(c)|BYTES_SH(0)
RGB=(1<<22)|(4<<16)|(3<<3)
CMYK=(1<<22)|(6<<16)|(4<<3)
LAB=(1<<22)|(10<<16)|(3<<3)
BPC=0x2000
SOFTPROOF=0x4000

class Session:
 def __init__(self,data):
  self.stack=ExitStack();self.buffer=C.create_string_buffer(data)
  self.destination=self.keep(open_profile(self.buffer,len(data)),close_profile)
  self.source=self.keep(srgb_profile(),close_profile)
  self.lab=self.keep(lab_profile(None),close_profile)
 def keep(self,handle,close):
  if not handle:self.stack.close();raise ValueError('LittleCMS ne peut pas créer la conversion.')
  self.stack.callback(close,handle);return handle
 def transform(self,values,source,source_type,destination,dest_type,channels,intent=1,flags=BPC):
  t=self.keep(create_transform(source,source_type,destination,dest_type,intent,flags),delete_transform)
  return self.apply(t,values,channels)
 def apply(self,transform,values,channels):
  flattened=[x for row in values for x in row]
  src=(C.c_double*len(flattened))(*flattened);out=(C.c_double*(channels*len(values)))()
  do_transform(transform,src,out,len(values))
  return [tuple(out[i*channels+j] for j in range(channels)) for i in range(len(values))]
 def __enter__(self):return self
 def __exit__(self,*args):self.stack.close()

def transform_palette(values,data,mode):
 with Session(data) as s:
  result=s.transform(values,s.source,RGB,s.destination,RGB if mode=='RGB' else CMYK,3 if mode=='RGB' else 4)
  return [tuple(v/(100 if mode=='CMYK' else 1) for v in row) for row in result]

def proof_palette(values,data,mode):
 with Session(data) as s:
  typ,channels=(RGB,3) if mode=='RGB' else (CMYK,4)
  converted=s.transform(values,s.source,RGB,s.destination,typ,channels)
  reconstructed=s.transform(converted,s.destination,typ,s.source,RGB,3)
  original_lab=s.transform(values,s.source,RGB,s.lab,LAB,3,flags=0)
  printed_lab=s.transform(converted,s.destination,typ,s.lab,LAB,3,flags=0)
  proof=s.keep(create_proof(s.source,RGB,s.source,RGB,s.destination,1,3,SOFTPROOF|BPC),delete_transform)
  shown=s.apply(proof,values,3)
  errors=[sum((a-b)**2 for a,b in zip(x,y))**.5 for x,y in zip(original_lab,printed_lab)]
  return shown,reconstructed,errors

def transform_cmyk_palette(values,source_data,dest_data,mode):
 """Preserve the stored CMYK numbers when the output profile is unchanged."""
 if source_data==dest_data and mode=='CMYK':return [tuple(row) for row in values]
 with Session(source_data) as s,Session(dest_data) as target:
  percent=[tuple(v*100 for v in row) for row in values]
  converted=s.transform(percent,s.destination,CMYK,target.destination,CMYK if mode=='CMYK' else RGB,4 if mode=='CMYK' else 3)
  return [tuple(v/(100 if mode=='CMYK' else 1) for v in row) for row in converted]

def proof_cmyk_palette(values,source_data,dest_data,mode):
 with Session(source_data) as source,Session(dest_data) as target:
  original=[tuple(v*100 for v in row) for row in values]
  typ,channels=(CMYK,4) if mode=='CMYK' else (RGB,3)
  if source_data==dest_data and mode=='CMYK':converted=original
  else:converted=source.transform(original,source.destination,CMYK,target.destination,typ,channels)
  reconstructed=target.transform(converted,target.destination,typ,target.source,RGB,3)
  original_lab=source.transform(original,source.destination,CMYK,source.lab,LAB,3,flags=0)
  printed_lab=target.transform(converted,target.destination,typ,target.lab,LAB,3,flags=0)
  # Absolute colorimetric output includes the selected paper white.
  shown=target.transform(converted,target.destination,typ,target.source,RGB,3,intent=3,flags=0)
  errors=[sum((a-b)**2 for a,b in zip(x,y))**.5 for x,y in zip(original_lab,printed_lab)]
  return shown,reconstructed,errors
