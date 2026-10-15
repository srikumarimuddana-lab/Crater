'use client';
import { useId, useState } from 'react';
import { useFormValues } from './form';
import { validImagePosition, imageEditorDefaults } from '@/lib/content/cms/presentation';

type Option={value:string;label:string};
type ImageFieldProps={name:string;label:string;image:string;position:string;options:Option[]};
export function ContentImageField(props:ImageFieldProps) {
  const values=useFormValues();
  const initial=imageEditorDefaults(props.name,props.image,props.position,values);
  return <ImageFieldControls key={`${initial.image}|${initial.position}`} {...props} {...initial}/>;
}
function ImageFieldControls({name,label,image,position,options}:ImageFieldProps) {
  const id=useId();
  const [source,setSource]=useState(image);
  const [point,setPoint]=useState((validImagePosition(position)?position:'50 50').split(' ').map(Number));
  return <fieldset className="a-image-editor"><legend>{label} settings</legend><div className="a-media-field">
    <div className="a-field"><label htmlFor={id}>{label}</label><select id={id} name={name} value={source} onChange={e=>setSource(e.target.value)}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    {source?<img src={source} alt={`${label} crop preview`} width={240} height={160} style={{objectPosition:`${point[0]}% ${point[1]}%`}}/>:<p className="a-muted">No image selected</p>}
  </div><input type="hidden" name={`${name}Position`} value={point.join(' ')} />
  <div className="a-focal-controls">{['Horizontal','Vertical'].map((axis,index)=><label className="a-field" key={axis}>{axis} focal point <output>{point[index]}%</output><input type="range" name={`${name}Position${index===0?'X':'Y'}`} min="0" max="100" value={point[index]} aria-label={`${label} ${axis.toLowerCase()} focal point`} onChange={e=>setPoint(current=>current.map((n,i)=>i===index?Number(e.target.value):n))}/></label>)}</div>
  <p className="a-hint">Choose which part stays visible when this image is cropped. Save the draft to preview it on the page.</p></fieldset>;
}
