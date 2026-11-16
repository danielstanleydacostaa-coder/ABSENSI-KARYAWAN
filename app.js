const KEY_TOKEN = 'absen.token', KEY_URL = 'absen.url', KEY_NAMA = 'absen.nama';
const $ = id => document.getElementById(id);
let CFG = null, STATUS = [], nextJenis = null, pending = null, clockTimer = null;

function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 3800);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function api(action, { method = 'GET', params = {}, body = {} } = {}) {
  const url = localStorage.getItem(KEY_URL), token = localStorage.getItem(KEY_TOKEN);
  if (!url) throw new Error('Alamat Apps Script belum diisi.');
  let res;
  if (method === 'GET') {
    const q = new URLSearchParams({ action, token, ...params });
    res = await fetch(url + '?' + q.toString());
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, ...body })
    });
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Terjadi kesalahan.');
  return data;
}

/* ---------- Login ---------- */
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const url = $('login-url').value.trim();
  const token = $('login-token').value;
  $('login-err').textContent = '';
  $('login-btn').disabled = true;
  localStorage.setItem(KEY_URL, url);
  localStorage.setItem(KEY_TOKEN, token);
  try {
    await loadConfig();
    showApp();
  } catch (err) {
    localStorage.removeItem(KEY_TOKEN);
    $('login-err').textContent = err.message;
  } finally {
    $('login-btn').disabled = false;
  }
});

$('logout').onclick = () => {
  localStorage.removeItem(KEY_TOKEN);
  location.reload();
};

async function loadConfig() {
  CFG = await api('config');
  const sel = $('nama');
  sel.innerHTML = CFG.karyawan.map(k => `<option value="${esc(k.nama)}">${esc(k.nama)}</option>`).join('');
  const simpan = localStorage.getItem(KEY_NAMA);
  if (simpan && CFG.karyawan.some(k => k.nama === simpan)) sel.value = simpan;
}

function showApp() {
  $('view-login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('tgl-label').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  tampilkanJam();
  clearInterval(clockTimer);
  clockTimer = setInterval(tampilkanJam, 1000);
  refreshStatus();
}

function tampilkanJam() {
  $('jam-now').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ---------- Status hari ini ---------- */
async function refreshStatus() {
  const nama = $('nama').value;
  if (!nama) return;
  localStorage.setItem(KEY_NAMA, nama);
  try {
    const data = await api('status', { params: { nama } });
    STATUS = data.rows;
    renderSteps();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderSteps() {
  const byJenis = {};
  STATUS.forEach(r => byJenis[r.jenis] = r);
  nextJenis = CFG.jenis.find(j => !byJenis[j]) || null;

  $('steps').innerHTML = CFG.jenis.map(j => {
    const r = byJenis[j];
    const cls = r ? 'done' : (j === nextJenis ? 'next' : '');
    const info = r
      ? r.jam.slice(0, 5) + (r.ket ? ' · ' + esc(r.ket) : '')
      : 'Jadwal ' + CFG.jam[j];
    return `<li class="${cls}"><span class="dot"></span><div class="st"><b>${CFG.jenisLabel[j]}</b><small>${info}</small></div></li>`;
  }).join('');

  const btn = $('btn-aksi');
  if (!nextJenis) {
    btn.disabled = true;
    btn.textContent = 'Absensi hari ini sudah lengkap';
  } else {
    btn.disabled = false;
    btn.textContent = 'Absen ' + CFG.jenisLabel[nextJenis] + ' (ambil foto)';
  }
}

$('nama').addEventListener('change', refreshStatus);

/* ---------- Foto & lokasi ---------- */
$('btn-aksi').onclick = () => {
  if (!nextJenis) return;
  $('foto').value = '';
  $('foto').click();
};

function ambilLokasi() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Perangkat tidak mendukung lokasi.'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      () => rej(new Error('Lokasi tidak bisa diambil. Izinkan akses lokasi untuk Safari di Pengaturan, lalu coba lagi.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function kompres(file, info) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const max = 800, s = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, w, h);
      const band = Math.round(h * 0.16);
      x.fillStyle = 'rgba(15,23,42,.72)';
      x.fillRect(0, h - band, w, band);
      x.fillStyle = '#fff';
      x.font = `700 ${Math.round(band * 0.3)}px system-ui,sans-serif`;
      const jam = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      x.fillText(`${info.nama} · ${info.label} · ${jam}`, 12, h - band * 0.52);
      x.font = `${Math.round(band * 0.25)}px system-ui,sans-serif`;
      x.fillText(`${info.lat.toFixed(5)}, ${info.lon.toFixed(5)}`, 12, h - band * 0.16);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => rej(new Error('Foto tidak bisa dibaca. Coba ambil ulang.'));
    img.src = URL.createObjectURL(file);
  });
}

$('foto').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !nextJenis) return;
  const jenis = nextJenis, label = CFG.jenisLabel[jenis], nama = $('nama').value;
  try {
    const loc = await ambilLokasi();
    const foto = await kompres(file, { nama, label, lat: loc.lat, lon: loc.lon });
    pending = { jenis, foto, lat: loc.lat, lon: loc.lon, acc: loc.acc };
    $('m-title').textContent = 'Absen ' + label;
    $('m-img').src = foto;
    $('m-info').textContent = 'Lokasi: ' + loc.lat.toFixed(5) + ', ' + loc.lon.toFixed(5) + ' (akurasi ±' + Math.round(loc.acc) + ' m)';
    $('modal').classList.remove('hidden');
  } catch (err) {
    toast(err.message, true);
  }
});

$('m-batal').onclick = () => {
  pending = null;
  $('modal').classList.add('hidden');
};

$('m-kirim').onclick = async () => {
  if (!pending) return;
  const btn = $('m-kirim');
  btn.disabled = true;
  btn.textContent = 'Mengirim…';
  try {
    const data = await api('absen', {
      method: 'POST',
      body: {
        nama: $('nama').value,
        jenis: pending.jenis,
        lat: pending.lat,
        lon: pending.lon,
        akurasi: pending.acc,
        foto: pending.foto
      }
    });
    toast(CFG.jenisLabel[pending.jenis] + ' tercatat pukul ' + data.jam.slice(0, 5) + (data.ket ? ' · ' + data.ket : ''));
    pending = null;
    $('modal').classList.add('hidden');
    await refreshStatus();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Kirim';
  }
};

/* ---------- Navigasi & rekap ---------- */
document.querySelectorAll('nav.bottom button').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('nav.bottom button').forEach(x => x.classList.toggle('on', x === b));
    const v = b.dataset.view;
    $('view-absen').classList.toggle('hidden', v !== 'absen');
    $('view-rekap').classList.toggle('hidden', v !== 'rekap');
    if (v === 'rekap') {
      if (!$('bulan').value) $('bulan').value = new Date().toLocaleDateString('sv-SE').slice(0, 7);
      loadRekap();
    }
  };
});
$('btn-rekap').onclick = loadRekap;
$('bulan').addEventListener('change', loadRekap);

async function loadRekap() {
  const bulan = $('bulan').value;
  $('rekap').innerHTML = '<p class="muted">Memuat…</p>';
  try {
    const d = await api('rekap', { params: { bulan } });
    $('rekap').innerHTML = d.orang.map(o => `
      <div class="card">
        <div class="row-h"><b>${esc(o.nama)}</b><span class="muted">${o.hadir} hari hadir</span></div>
        <div class="stats">
          <div><b>${esc(o.totalJam)}</b><small>Total jam kerja</small></div>
          <div><b>${o.telat}</b><small>Terlambat</small></div>
          <div><b>${o.belumPulang}</b><small>Belum pulang</small></div>
        </div>
        <details>
          <summary>Detail harian</summary>
          <div class="drow head"><span>Tgl</span><span>Masuk</span><span>Ist.</span><span>Kembali</span><span>Pulang</span><span>Kerja</span></div>
          ${o.detail.length ? o.detail.map(r => `
            <div class="drow">
              <span>${r.tanggal.slice(8)}</span>
              <span>${r.masuk.slice(0, 5)}</span>
              <span>${r.istirahat.slice(0, 5)}</span>
              <span>${r.kembali.slice(0, 5)}</span>
              <span>${r.pulang.slice(0, 5)}</span>
              <span>${esc(r.kerja)}</span>
            </div>`).join('') : '<p class="muted">Belum ada data bulan ini.</p>'}
        </details>
      </div>`).join('');
  } catch (err) {
    $('rekap').innerHTML = '';
    toast(err.message, true);
  }
}

/* ---------- Start ---------- */
(async function init() {
  if (localStorage.getItem(KEY_URL)) $('login-url').value = localStorage.getItem(KEY_URL);
  if (localStorage.getItem(KEY_TOKEN) && localStorage.getItem(KEY_URL)) {
    try {
      await loadConfig();
      showApp();
    } catch (err) {
      localStorage.removeItem(KEY_TOKEN);
      $('login-err').textContent = err.message;
    }
  }
})();
