import React from 'react';

export const uid = () => Math.random().toString(36).slice(2, 10);
export function Field({ label, children }) { return <label className="ce-field"><span>{label}</span>{children}</label>; }
export function Check({ label, value, onChange }) { return <label className="ce-check"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)}/>{label}</label>; }
export function Num({ label, value, onChange, placeholder = 'auto' }) { return <Field label={label}><input inputMode="decimal" value={value ?? ''} placeholder={placeholder} onChange={e => { const v = e.target.value; onChange(v === '' ? undefined : v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v); }}/></Field>; }
export function TitleField({ value, onChange }) { return <Field label="Title"><input value={value || ''} placeholder="No title" onChange={e => onChange(e.target.value)}/></Field>; }
