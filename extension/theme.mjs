// Shared tokens for the popup and isolated extension overlays. Theme changes
// affect only the supplied root/host, never the website underneath an overlay.
const light={
 bg:'#F3F5F9',sf:'#FFFFFF',ln:'#DCE3ED',tx:'#0F1B2E',mu:'#526179',ac:'#2F5BEA',as:'#E8EEFE',on:'#FFFFFF',
 qb:'#E8EEFE',qt:'#1D3FAE',bb:'#FFF0CC',bt:'#7A4A00',eb:'#F1E6FF',et:'#5B21B6',wn:'#FFF3CF',wt:'#6B4200',
 sky:'#FFF0D2',sun:'#FBBF5C',h1:'#BFE6D6',h2:'#7FD0B2',h3:'#4FB394',
 'tone-amber':'#946000','tone-coral':'#B94F32','tone-violet':'#7150BD','tone-green':'#087F61','tone-sky':'#1E739B',
 danger:'#B42332','control-border':'#CBD5E1','switch-off':'#718096','switch-knob':'#FFFFFF','switch-off-knob':'#FFFFFF',
 'selected-day-ink':'#FFFFFF','selected-day-muted':'#FFFFFF','week-glow':'rgba(47,91,234,.16)',
 'done-opacity':'1','done-gap-opacity':'1','ring-color':'#0A9678',
};
const dark={
 bg:'#0D121C',sf:'#151C2A',ln:'#263044',tx:'#E8EDF6',mu:'#9AA7BD',ac:'#8AA5FF',as:'#1F2B4D',on:'#0D121C',
 qb:'#1F2B4D',qt:'#B7C7FF',bb:'#3A2D0E',bt:'#FFD479',eb:'#2E2150',et:'#D5BEFF',wn:'#3A2D0E',wt:'#FFD479',
 sky:'#1E2436',sun:'#E9B25A',h1:'#1F3F44',h2:'#1B5A57',h3:'#14706A',
 'tone-amber':'#F6BD4B','tone-coral':'#FF9B7A','tone-violet':'#B69CFF','tone-green':'#5BD6A4','tone-sky':'#6CC4F0',
 danger:'#FF9B9B','control-border':'#34425A','switch-off':'#1E2A3C','switch-knob':'#0A0F16','switch-off-knob':'#9AA7BD',
 'selected-day-ink':'#0A0F16','selected-day-muted':'rgba(10,15,22,.7)','week-glow':'rgba(143,163,255,.35)',
 'done-opacity':'.55','done-gap-opacity':'.5','ring-color':'#30D6AC',
};
export function bindTheme(target){
 const system=matchMedia('(prefers-color-scheme: dark)');let preference='system',resolved='';
 const apply=()=>{
  const next=preference==='system'?(system.matches?'dark':'light'):preference;
  target.dataset.themePreference=preference;
  if(next===resolved)return;
  resolved=next;target.dataset.theme=next;target.style.colorScheme=next;
  for(const [name,value] of Object.entries(next==='dark'?dark:light))target.style.setProperty('--'+name,value);
 };
 system.addEventListener('change',apply);
 apply();
 return value=>{const next=['system','light','dark'].includes(value)?value:'system';if(next===preference)return;preference=next;apply();};
}
