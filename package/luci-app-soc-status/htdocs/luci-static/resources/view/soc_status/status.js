'use strict';
'require view';
'require poll';
'require rpc';
'require ui';

var callStatus = rpc.declare({ object: 'luci.soc_status', method: 'getStatus' });
var callHnatStats = rpc.declare({ object: 'luci.soc_status', method: 'getHnatStats' });
var callOffloadStats = rpc.declare({ object: 'luci.soc_status', method: 'getOffloadStats' });
var callCpuUsage = rpc.declare({ object: 'luci.soc_status', method: 'getCpuUsage' });
var callSetGov = rpc.declare({ object: 'luci.soc_status', method: 'setGovernor', params: ['governor'] });
var callSetMax = rpc.declare({ object: 'luci.soc_status', method: 'setMaxFreq', params: ['freq'] });

/* ── Theme-adaptive CSS ── */
var themeCSS = '.soc-card{background:var(--soc-card-bg);border:1px solid var(--soc-border);border-radius:8px;padding:14px;transition:border-color .3s}.soc-card-accent{border-left-width:3px;border-left-style:solid}.soc-muted{color:var(--soc-muted)}.soc-text{color:var(--soc-text)}.soc-label{font-size:11px;color:var(--soc-muted)}.soc-bar-track{background:var(--soc-bar-track);border-radius:4px;overflow:hidden}.soc-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}.soc-badge-on{background:#1b5e20;color:#a5d6a7}.soc-badge-off{background:#4e342e;color:#ef9a9a}.soc-badge-active{background:#00695c;color:#80cbc4}.soc-stat-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0}.soc-stat-val{font-size:20px;font-weight:700}.soc-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.soc-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.soc-table-mini{width:100%;font-size:11px;border-collapse:collapse}.soc-table-mini td{padding:2px 6px;border-bottom:1px solid var(--soc-border)}.soc-table-mini td:last-child{text-align:right;font-weight:500}';

var _lastDark = null;

function isDark() {
	var el = document.body;
	if (!el) return false;
	var bg = window.getComputedStyle(el).backgroundColor;
	var m = bg.match(/\d+/g);
	if (m && m.length >= 3) return (parseInt(m[0])*299 + parseInt(m[1])*587 + parseInt(m[2])*114)/1000 < 128;
	return false;
}

function injectCSS() {
	var el = document.getElementById('soc-style');
	if (!el) { el = document.createElement('style'); el.id = 'soc-style'; document.head.appendChild(el); }
	var dark = isDark();
	if (dark === _lastDark) return;
	_lastDark = dark;
	el.textContent = themeCSS + (dark
		? ':root{--soc-card-bg:#1e1e1e;--soc-border:#333;--soc-muted:#999;--soc-text:#e0e0e0;--soc-bar-track:#333}'
		: ':root{--soc-card-bg:#fff;--soc-border:#d0d0d0;--soc-muted:#666;--soc-text:#222;--soc-bar-track:#e0e0e0}');
}

/* ── Helpers ── */
function fmtFreq(khz) { return khz ? (khz/1000).toFixed(0)+' MHz' : 'N/A'; }
function fmtBytes(b) {
	if (!b || b===0) return '0 B';
	if (b>=1073741824) return (b/1073741824).toFixed(1)+' GiB';
	if (b>=1048576) return (b/1048576).toFixed(0)+' MiB';
	return (b/1024).toFixed(0)+' KiB';
}
function fmtPkts(p) {
	if (!p || p===0) return '0';
	if (p>=1000000) return (p/1000000).toFixed(1)+'M';
	if (p>=1000) return (p/1000).toFixed(0)+'K';
	return String(p);
}
function fmtUptime(s) {
	if (!s||s<60) return s+'s';
	if (s<3600) return Math.floor(s/60)+'m';
	if (s<86400) return Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'m';
	return Math.floor(s/86400)+'d '+Math.floor(s%86400/3600)+'h';
}

/* ── CPU Frequency Card ── */
function renderCpuCard(st) {
	var hw=st.cpu_hw_freq||0, cur=st.cpu_cur_freq||0, min=st.cpu_min_freq||0, max=st.cpu_max_freq||0;
	var pct=max>min?Math.round(((Math.min(hw||cur,max)-min)/(max-min))*100):0;
	pct=Math.max(0,Math.min(100,pct));
	var gov=st.cpu_governor||'unknown';
	var arch=st.cpu_arch||'ARMv8';
	var cores=st.cpu_cores||4;

	var govs=(st.cpu_avail_governors||'').trim().split(/\s+/).filter(Boolean);
	var freqs=(st.cpu_avail_freqs||'').trim().split(/\s+/).filter(Boolean);

	// Governor label mapping
	var govLabel=function(g){
		var map={conservative:_('conservative'),ondemand:_('ondemand'),userspace:_('userspace'),powersave:_('powersave'),performance:_('performance'),schedutil:_('schedutil')};
		return map[g]||g;
	};

	return E('div',{'class':'soc-card soc-card-accent','style':'border-left-color:#2e7d32'},[
		E('div',{'style':'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px'},[
			E('span',{'style':'font-weight:bold;color:#2e7d32;font-size:14px'},_('CPU Frequency')),
			E('span',{'class':'soc-muted','style':'font-size:11px'},arch+' x '+cores)
		]),
		E('div',{'style':'display:flex;align-items:center;gap:8px;margin-bottom:6px'},[
			E('span',{'class':'soc-muted','style':'font-size:11px'},fmtFreq(min)),
			E('div',{'class':'soc-bar-track','style':'flex:1;height:22px;position:relative;min-width:120px'},[
				E('div',{'id':'cpu-bar','style':'background:linear-gradient(90deg,#2e7d32,#66bb6a);height:100%;border-radius:4px;width:'+pct+'%;transition:width .5s'}),
				E('span',{'id':'cpu-freq-text','style':'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.6)'},fmtFreq(hw||cur))
			]),
			E('span',{'class':'soc-muted','style':'font-size:11px'},fmtFreq(max))
		]),
		E('div',{'style':'display:flex;gap:12px;align-items:center;flex-wrap:wrap'},[
			E('span',{'class':'soc-label'},_('Governor')+':'),
			E('select',{'id':'gov-sel','class':'cbi-input-select','style':'min-width:110px','change':function(ev){
				var g=ev.target.value; ev.target.disabled=true;
				callSetGov(g).then(function(r){ev.target.disabled=false;if(r&&r.error)ui.addNotification(null,E('p',{},r.error),'error');}).catch(function(){ev.target.disabled=false;});
			}},govs.map(function(g){return E('option',{'value':g,'selected':g===gov?'':null},govLabel(g));})),
			E('span',{'class':'soc-label'},_('Max')+':'),
			E('select',{'id':'maxfreq-sel','class':'cbi-input-select','style':'min-width:110px','change':function(ev){
				var f=parseInt(ev.target.value); ev.target.disabled=true;
				callSetMax(f).then(function(r){ev.target.disabled=false;if(r&&r.error)ui.addNotification(null,E('p',{},r.error),'error');}).catch(function(){ev.target.disabled=false;});
			}},freqs.map(function(f){return E('option',{'value':f,'selected':parseInt(f)===parseInt(max)?'':null},(parseInt(f)/1000).toFixed(0)+' MHz');}))
		])
	]);
}

/* ── HNAT Acceleration Card ── */
function renderHnatCard(st, hs) {
	var on=st.hnat_enabled===true||st.hnat_enabled==='true';
	var hook=st.hnat_hook||0, qos=st.hnat_qos||0;
	var totalB=st.hnat_bound||0, totalA=st.hnat_total||0;

	// Use ppe_summary from new hnat_parse helper format
	var ppe=(hs&&hs.ppe_summary)||[];

	return E('div',{'class':'soc-card soc-card-accent','style':'border-left-color:'+(on?'#00bcd4':'#666')},[
		E('div',{'style':'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'},[
			E('span',{'style':'font-weight:bold;color:#00bcd4;font-size:14px'},_('MediaTek HNAT')),
			E('span',{'class':'soc-badge '+(on?'soc-badge-active':'soc-badge-off')},on?_('Active'):_('Off'))
		]),
		E('div',{'class':'soc-label','style':'margin-bottom:6px'},_('Hardware NAT / PPE Offload Engine')),
		E('div',{'style':'display:flex;gap:16px;font-size:12px;margin-bottom:6px'},[
			E('span',{},[E('span',{'class':'soc-muted'},_('Flows/Bound')+': '),E('span',{'id':'hnat-bound','class':'soc-text','style':'font-weight:bold'},totalB)]),
			E('span',{},[E('span',{'class':'soc-muted'},_('Capacity')+': '),E('span',{'id':'hnat-total','class':'soc-text'},totalA)]),
			E('span',{},[E('span',{'class':'soc-muted'},_('Hook')+': '),E('span',{'class':'soc-text'},hook?_('ON'):_('OFF'))]),
			E('span',{},[E('span',{'class':'soc-muted'},_('QoS')+': '),E('span',{'class':'soc-text'},qos?_('ON'):_('OFF'))])
		]),
		ppe.length?E('div',{'style':'display:flex;gap:8px;flex-wrap:wrap'}, ppe.map(function(p){
			var pct=p.total>0?Math.round(p.bind/p.total*100):0;
			var c=pct>70?'#4caf50':pct>30?'#ff9800':'#888';
			return E('div',{'style':'background:var(--soc-card-bg);border:1px solid var(--soc-border);border-radius:4px;padding:4px 8px;font-size:11px;min-width:80px'},[
				E('div',{'style':'color:'+c+';font-weight:bold'},'PPE'+p.id),
				E('div',{'style':'color:var(--soc-muted)'},p.bind+'/'+p.total),
				E('div',{'class':'soc-bar-track','style':'height:3px;margin-top:2px'},[
					E('div',{'style':'background:'+c+';height:100%;width:'+pct+'%;border-radius:3px'})
				])
			]);
		})):null
	]);
}

/* ── Offload Engine Card (Airoha CDM-style) ── */
function renderOffloadCard(os) {
	os=os||{};
	var hwB=os.hw_bytes||0, swB=os.sw_bytes||0, totB=hwB+swB;
	var hwP=os.hw_pkts||0, swP=os.sw_pkts||0, totP=hwP+swP;
	var ratio=totB>0?Math.round(hwB*100/totB):0;
	var pktRatio=totP>0?Math.round(hwP*100/totP):0;
	var hwF=os.hw_flows||0, swF=os.sw_flows||0;
	var barCol=ratio>80?'#4caf50':ratio>50?'#ff9800':'#f44336';
	var hnapt=os.hnapt||0, ipv6=os.ipv6||0, vlan=os.vlan||0, pppoe=os.pppoe||0;

	return E('div',{'class':'soc-card','style':'margin-top:10px'},[
		E('div',{'style':'font-weight:bold;color:var(--soc-text);font-size:14px;margin-bottom:8px'},_('Offload Engine')),
		E('div',{'style':'display:flex;gap:16px;margin-bottom:8px'},[
			E('div',{'style':'flex:1'},[
				E('div',{'style':'display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px'},[
					E('span',{'class':'soc-muted'},_('Byte Offload Ratio')),
					E('span',{'class':'soc-text','style':'font-weight:bold;color:'+barCol},ratio+'%')
				]),
				E('div',{'class':'soc-bar-track','style':'height:8px'},[
					E('div',{'style':'background:'+barCol+';height:100%;width:'+ratio+'%;border-radius:4px;transition:width .5s'})
				]),
				E('div',{'style':'display:flex;justify-content:space-between;font-size:10px;margin-top:3px'},[
					E('span',{'class':'soc-muted'},'HW: '+fmtBytes(hwB)),
					E('span',{'class':'soc-muted'},'CPU: '+fmtBytes(swB))
				])
			]),
			E('div',{'style':'flex:1'},[
				E('div',{'style':'display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px'},[
					E('span',{'class':'soc-muted'},_('Packet Ratio')),
					E('span',{'class':'soc-text','style':'font-weight:bold'},pktRatio+'%')
				]),
				E('div',{'class':'soc-bar-track','style':'height:8px'},[
					E('div',{'style':'background:#607d8b;height:100%;width:'+pktRatio+'%;border-radius:4px;transition:width .5s'})
				]),
				E('div',{'style':'display:flex;justify-content:space-between;font-size:10px;margin-top:3px'},[
					E('span',{'class':'soc-muted'},'HW: '+fmtPkts(hwP)+' pkts'),
					E('span',{'class':'soc-muted'},'CPU: '+fmtPkts(swP)+' pkts')
				])
			])
		]),
		E('div',{'style':'display:flex;gap:20px;font-size:11px;flex-wrap:wrap'},[
			E('span',{},[E('span',{'class':'soc-muted'},_('HW Flows')+': '),E('span',{'class':'soc-text'},hwF)]),
			E('span',{},[E('span',{'class':'soc-muted'},_('SW Flows')+': '),E('span',{'class':'soc-text'},swF)]),
			E('span',{},[E('span',{'class':'soc-muted'},'HNAPT: '),E('span',{'class':'soc-text'},hnapt)]),
			E('span',{},[E('span',{'class':'soc-muted'},'IPv6: '),E('span',{'class':'soc-text'},ipv6)]),
			E('span',{},[E('span',{'class':'soc-muted'},'VLAN: '),E('span',{'class':'soc-text','style':'color:'+(vlan>0?'#4caf50':'var(--soc-muted)')},vlan)]),
			E('span',{},[E('span',{'class':'soc-muted'},'PPPoE: '),E('span',{'class':'soc-text','style':'color:'+(pppoe>0?'#4caf50':'var(--soc-muted)')},pppoe)])
		])
	]);
}

/* ── Thermal & Fan Card ── */
function renderThermalCard(st) {
	var temp=st.thermal_cpu||'--';
	var fan=st.fan||{};
	var pwm=fan.pwm_raw||0, pct=fan.pwm_percent||0, rpm=fan.fan_rpm||0;
	var fanState=fan.state||'unknown';
	var fanStateLabel=fanState==='active'?_('Active'):fanState==='standby'?_('Standby'):fanState==='transition'?_('Transition'):fanState==='off'?_('Off'):fanState;
	var fanColor=fanState==='active'?'#4caf50':fanState==='transition'?'#ff9800':'#888';
	var board=fan.board_name||fan.profile||'';

	return E('div',{'class':'soc-card soc-card-accent','style':'border-left-color:#ff6f00'},[
		E('div',{'style':'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'},[
			E('span',{'style':'font-weight:bold;color:#ff6f00;font-size:14px'},_('Thermal & Fan')),
			E('span',{'class':'soc-badge','style':'background:'+fanColor+';color:#fff'},fanStateLabel)
		]),
		E('div',{'style':'display:flex;gap:24px;font-size:13px;margin-bottom:8px'},[
			E('div',{},[E('span',{'class':'soc-muted'},_('CPU Temp')+': '),E('span',{'class':'soc-text','style':'font-weight:bold;font-size:22px','id':'cpu-temp'},temp+'\u00B0C')]),
			E('div',{},[
				E('span',{'class':'soc-muted'},_('Fan')+': '),
				E('span',{'class':'soc-text','style':'font-weight:bold'},pct+'%'),
				E('span',{'class':'soc-muted','style':'margin-left:8px'},'PWM:'+pwm+' RPM:'+rpm)
			])
		]),
		board?E('div',{'class':'soc-label'},_('Profile')+': '+board):null
	]);
}

/* ── System Resources Card ── */
function renderSysCard(st) {
	var total=st.mem_total||0, avail=st.mem_avail||0;
	var used=total-avail; if(used<0) used=0;
	var pct=total>0?Math.round((used/total)*100):0;
	var up=st.uptime||0;
	var cpuPct=st.cpu_usage_pct||0;

	return E('div',{'class':'soc-card'},[
		E('div',{'style':'font-weight:bold;color:var(--soc-text);font-size:14px;margin-bottom:8px'},_('System Resources')),
		E('div',{'class':'soc-stat-row'},[
			E('span',{'class':'soc-muted'},_('CPU Load')),
			E('span',{'class':'soc-stat-val','id':'cpu-load', 'style':'font-size:16px'},cpuPct+'%')
		]),
		E('div',{'class':'soc-stat-row'},[
			E('span',{'class':'soc-muted'},_('Memory')),
			E('span',{'class':'soc-text'},fmtBytes(used)+' / '+fmtBytes(total)+' ('+pct+'%)')
		]),
		E('div',{'class':'soc-bar-track','style':'height:6px;margin:4px 0'},[
			E('div',{'id':'mem-bar','style':'background:'+(pct>80?'#f44336':pct>50?'#ff9800':'#4caf50')+';height:100%;border-radius:4px;width:'+pct+'%;transition:width .5s'})
		]),
		E('div',{'class':'soc-stat-row'},[
			E('span',{'class':'soc-muted'},_('Uptime')),
			E('span',{'class':'soc-text'},fmtUptime(up))
		])
	]);
}

/* ── HNAT Flow Table ── */
function renderHnatFlowTable(hs) {
	var flows=(hs&&hs.flows)||[];
	var fc=hs&&hs.flow_count||0;
	if(!flows.length) return null;
	var rows=[E('tr',{'style':'font-weight:600'},[
		E('td',{},'PPE'),E('td',{},'#'),E('td',{},_('Original')),
		E('td',{},_('NAT To')),E('td',{},_('Reply To'))
	])];
	for(var i=0;i<flows.length&&i<40;i++){
		var f=flows[i];
		rows.push(E('tr',{},[
			E('td',{},f.ppe),E('td',{},f.idx),
			E('td',{},(f.orig||'')+' \u2192 '+(f.dest||'')),
			E('td',{},(f.nat||'')+' \u2192 '+(f.dest||'')),
			E('td',{},(f.orig||'')+' \u2192 '+(f.reply||''))
		]));
	}
	return E('div',{'class':'soc-card','style':'margin-top:10px'},[
		E('div',{'style':'font-weight:bold;color:var(--soc-text);font-size:13px;margin-bottom:6px'},_('HNAT Flow Entries')+' ('+fc+')'),
		E('div',{'style':'max-height:300px;overflow-y:auto'},[
			E('table',{'class':'soc-table-mini'}, rows)
		])
	]);
}

/* ── Update helpers ── */
function updateCpuBar(st) {
	var hw=st.cpu_hw_freq||0, cur=st.cpu_cur_freq||0, min=st.cpu_min_freq||0, max=st.cpu_max_freq||0;
	var pct=max>min?Math.round(((Math.min(hw||cur,max)-min)/(max-min))*100):0;
	var bar=document.getElementById('cpu-bar');
	var txt=document.getElementById('cpu-freq-text');
	var govSel=document.getElementById('gov-sel');
	var maxSel=document.getElementById('maxfreq-sel');
	if(bar) bar.style.width=Math.max(0,Math.min(100,pct))+'%';
	if(txt) txt.textContent=fmtFreq(hw||cur);
	if(govSel&&!govSel.matches(':focus')) govSel.value=st.cpu_governor||'';
	if(maxSel&&!maxSel.matches(':focus')) maxSel.value=(st.cpu_max_freq||0).toString();
}

function updateSysBlock(st) {
	var el=document.getElementById('cpu-load');
	if(el)el.textContent=(st.cpu_usage_pct||0)+'%';
	var mb=document.getElementById('mem-bar');
	if(mb){
		var tot=st.mem_total||0,avail=st.mem_avail||0,used=tot-avail;
		var p= tot>0?Math.round((used/tot)*100):0;
		mb.style.width=p+'%';
		mb.style.background=p>80?'#f44336':p>50?'#ff9800':'#4caf50';
	}
}

function updateThermalBlock(st) {
	var el=document.getElementById('cpu-temp');
	if(el) el.textContent=(st.thermal_cpu||'--')+'\u00B0C';
}

/* ── Main View ── */
return view.extend({
	load: function() {
		return Promise.all([callStatus(), callCpuUsage(), callHnatStats(), callOffloadStats()]);
	},
	render: function(data) {
		injectCSS();
		var st=data[0]||{}, cu=data[1]||{}, hs=data[2]||{}, os=data[3]||{};
		st.cpu_usage_pct=cu.cpu_usage_pct||0;

		var view=E('div',{'class':'cbi-map'},[
			E('h2',{},_('MT7988 SoC Status')),
			E('div',{'class':'soc-grid-2'},[
				renderCpuCard(st),
				renderThermalCard(st)
			]),
			E('div',{'id':'hnat-section','class':'soc-grid-2','style':'margin-top:10px'},[
				renderHnatCard(st, hs),
				renderSysCard(st)
			]),
			E('div',{'id':'offload-section'}, renderOffloadCard(os)),
			E('div',{'id':'hnat-flow-section'}, renderHnatFlowTable(hs)||E('div',{'class':'soc-card','style':'margin-top:10px'},E('em',{'class':'soc-muted'},_('No active offload flows'))))
		]);

		poll.add(L.bind(function(){
			return Promise.all([callStatus(),callCpuUsage(),callHnatStats(),callOffloadStats()]).then(L.bind(function(d){
				injectCSS();
				var s=d[0]||{}, cu2=d[1]||{}, h2=d[2]||{}, o2=d[3]||{};
				s.cpu_usage_pct=cu2.cpu_usage_pct||0;
				updateCpuBar(s);
				updateThermalBlock(s);
				updateSysBlock(s);
				var hc=document.getElementById('hnat-section');
				if(hc){hc.innerHTML='';hc.appendChild(renderHnatCard(s,h2));hc.appendChild(renderSysCard(s));}
				var oc=document.getElementById('offload-section');
				if(oc){oc.innerHTML='';oc.appendChild(renderOffloadCard(o2));}
				var ft=document.getElementById('hnat-flow-section');
				if(ft){ft.innerHTML='';var nf=renderHnatFlowTable(h2);ft.appendChild(nf||E('div',{'class':'soc-card','style':'margin-top:10px'},E('em',{'class':'soc-muted'},_('No active offload flows'))));}
			},this));
		},this),5);

		return view;
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
