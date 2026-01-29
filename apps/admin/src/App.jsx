import React, { useEffect, useState } from 'react'

const CORE_API = import.meta.env.VITE_CORE_API || 'http://localhost:8081'
const BOOKING_API = import.meta.env.VITE_BOOKING_API || 'http://localhost:8082'
const BOOKING_ADMIN_SECRET = import.meta.env.VITE_BOOKING_ADMIN_SECRET || ''

export default function App() {
  const [tab, setTab] = useState('produk')
  const [adminToken, setAdminToken] = useState(localStorage.getItem('admin_token') || '')
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [products, setProducts] = useState([])
  const [schedules, setSchedules] = useState([])
  const [members, setMembers] = useState([])
  const [orders, setOrders] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [appointments, setAppointments] = useState([])
  const [serviceBookings, setServiceBookings] = useState([])
  const [staff, setStaff] = useState([])
  const [productForm, setProductForm] = useState({ name: '', price: 0, stock: 0, category: '' })
  const [scheduleForm, setScheduleForm] = useState({ doctor_name: '', day_of_week: 'Senin', start_time: '09:00', end_time: '16:00', location: 'Petshop Bento - Cikande' })
  const [voucherForm, setVoucherForm] = useState({ code: '', title: '', discount_type: 'flat', discount_value: 0, min_spend: 0, max_uses: 0, expires_at: '', active: true })
  const [staffForm, setStaffForm] = useState({ name: '', email: '', phone: '', password: '', role: 'staff' })

  const adminHeaders = adminToken ? { 'X-Auth-Token': adminToken } : {}
  const bookingAdminHeaders = BOOKING_ADMIN_SECRET ? { 'X-Admin-Secret': BOOKING_ADMIN_SECRET } : {}

  const load = () => {
    fetch(`${CORE_API}/products`, { headers: adminHeaders }).then(r => r.json()).then(setProducts).catch(() => setProducts([]))
    fetch(`${BOOKING_API}/schedules`).then(r => r.json()).then(setSchedules).catch(() => setSchedules([]))
    fetch(`${CORE_API}/admin/members`, { headers: adminHeaders }).then(r => r.json()).then(setMembers).catch(() => setMembers([]))
    fetch(`${CORE_API}/admin/orders`, { headers: adminHeaders }).then(r => r.json()).then(setOrders).catch(() => setOrders([]))
    fetch(`${CORE_API}/admin/vouchers`, { headers: adminHeaders }).then(r => r.json()).then(setVouchers).catch(() => setVouchers([]))
    fetch(`${CORE_API}/admin/staff`, { headers: adminHeaders }).then(r => r.json()).then(setStaff).catch(() => setStaff([]))
    fetch(`${BOOKING_API}/admin/appointments`, { headers: bookingAdminHeaders }).then(r => r.json()).then(setAppointments).catch(() => setAppointments([]))
    fetch(`${BOOKING_API}/admin/service-bookings`, { headers: bookingAdminHeaders }).then(r => r.json()).then(setServiceBookings).catch(() => setServiceBookings([]))
  }

  useEffect(() => {
    if (adminToken) load()
  }, [adminToken])

  const submitProduct = (e) => {
    e.preventDefault()
    fetch(`${CORE_API}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify(productForm)
    }).then(() => { setProductForm({ name: '', price: 0, stock: 0, category: '' }); load() })
  }

  const submitSchedule = (e) => {
    e.preventDefault()
    fetch(`${BOOKING_API}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bookingAdminHeaders },
      body: JSON.stringify(scheduleForm)
    }).then(() => { load() })
  }

  const submitVoucher = (e) => {
    e.preventDefault()
    fetch(`${CORE_API}/admin/vouchers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify(voucherForm)
    }).then(() => { setVoucherForm({ code: '', title: '', discount_type: 'flat', discount_value: 0, min_spend: 0, max_uses: 0, expires_at: '', active: true }); load() })
  }

  const submitStaff = (e) => {
    e.preventDefault()
    fetch(`${CORE_API}/admin/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify(staffForm)
    }).then(() => { setStaffForm({ name: '', email: '', phone: '', password: '', role: 'staff' }); load() })
  }

  const updateOrderStatus = (id, status) => {
    fetch(`${CORE_API}/admin/orders/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({ status })
    }).then(() => load())
  }

  const submitLogin = (e) => {
    e.preventDefault()
    fetch(`${CORE_API}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm)
    }).then(r => r.json()).then(data => {
      if (data.token) {
        localStorage.setItem('admin_token', data.token)
        setAdminToken(data.token)
      }
    })
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    setAdminToken('')
  }

  if (!adminToken) {
    return (
      <div className="login-wrap">
        <div className="card">
          <h3>Admin Login</h3>
          <form className="form-grid" onSubmit={submitLogin}>
            <input placeholder="Email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
            <input placeholder="Password" type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
            <button className="btn" type="submit">Masuk</button>
          </form>
          <p>Gunakan endpoint /admin/bootstrap untuk buat admin pertama.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <header className="header">
        <div className="logo">PETSHOP BENTO ADMIN</div>
        <div>Manajemen Produk, Layanan, dan Member</div>
        <button className="btn" onClick={logout}>Keluar</button>
      </header>
      <div className="wrapper">
        <aside className="sidebar">
          <button className={`nav-btn ${tab === 'produk' ? 'active' : ''}`} onClick={() => setTab('produk')}>Produk</button>
          <button className={`nav-btn ${tab === 'jadwal' ? 'active' : ''}`} onClick={() => setTab('jadwal')}>Jadwal Dokter</button>
          <button className={`nav-btn ${tab === 'booking' ? 'active' : ''}`} onClick={() => setTab('booking')}>Booking</button>
          <button className={`nav-btn ${tab === 'member' ? 'active' : ''}`} onClick={() => setTab('member')}>Member</button>
          <button className={`nav-btn ${tab === 'staff' ? 'active' : ''}`} onClick={() => setTab('staff')}>Staff</button>
          <button className={`nav-btn ${tab === 'voucher' ? 'active' : ''}`} onClick={() => setTab('voucher')}>Voucher</button>
          <button className={`nav-btn ${tab === 'order' ? 'active' : ''}`} onClick={() => setTab('order')}>Order</button>
        </aside>
        <main className="content">
          {tab === 'produk' && (
            <div>
              <div className="card">
                <h3>Tambah Produk</h3>
                <form className="form-grid" onSubmit={submitProduct}>
                  <input placeholder="Nama" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                  <input placeholder="Harga" type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })} />
                  <input placeholder="Stok" type="number" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: Number(e.target.value) })} />
                  <input placeholder="Kategori" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} />
                  <button className="btn" type="submit">Simpan</button>
                </form>
              </div>
              <div className="card">
                <h3>Daftar Produk</h3>
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Kategori</th><th>Harga</th><th>Stok</th></tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.category || '-'}</td>
                        <td>{p.price}</td>
                        <td>{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'jadwal' && (
            <div>
              <div className="card">
                <h3>Tambah Jadwal Dokter</h3>
                <form className="form-grid" onSubmit={submitSchedule}>
                  <input placeholder="Nama Dokter" value={scheduleForm.doctor_name} onChange={(e) => setScheduleForm({ ...scheduleForm, doctor_name: e.target.value })} />
                  <select value={scheduleForm.day_of_week} onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: e.target.value })}>
                    {['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input type="time" value={scheduleForm.start_time} onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} />
                  <input type="time" value={scheduleForm.end_time} onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })} />
                  <input placeholder="Lokasi" value={scheduleForm.location} onChange={(e) => setScheduleForm({ ...scheduleForm, location: e.target.value })} />
                  <button className="btn" type="submit">Simpan</button>
                </form>
              </div>
              <div className="card">
                <h3>Jadwal Tersedia</h3>
                <table className="table">
                  <thead>
                    <tr><th>Dokter</th><th>Hari</th><th>Jam</th><th>Lokasi</th></tr>
                  </thead>
                  <tbody>
                    {schedules.map(s => (
                      <tr key={s.id}>
                        <td>{s.doctor_name}</td>
                        <td>{s.day_of_week}</td>
                        <td>{s.start_time} - {s.end_time}</td>
                        <td>{s.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'booking' && (
            <div>
              <div className="card">
                <h3>Appointment Dokter</h3>
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Telepon</th><th>Pet</th><th>Layanan</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {appointments.map(a => (
                      <tr key={a.id}>
                        <td>{a.customer_name}</td>
                        <td>{a.phone}</td>
                        <td>{a.pet_name}</td>
                        <td>{a.service_type}</td>
                        <td>{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card">
                <h3>Grooming dan Penitipan</h3>
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Telepon</th><th>Layanan</th><th>Tanggal</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {serviceBookings.map(b => (
                      <tr key={b.id}>
                        <td>{b.customer_name}</td>
                        <td>{b.phone}</td>
                        <td>{b.service_type}</td>
                        <td>{b.date}</td>
                        <td>{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'member' && (
            <div className="card">
              <h3>Daftar Member</h3>
              <table className="table">
                <thead>
                  <tr><th>Nama</th><th>Email</th><th>Tier</th><th>Total Belanja</th><th>Saldo Cashback</th></tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.email}</td>
                      <td>{m.tier}</td>
                      <td>{m.total_spend}</td>
                      <td>{m.wallet_balance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'staff' && (
            <div>
              <div className="card">
                <h3>Tambah Staff/Admin</h3>
                <form className="form-grid" onSubmit={submitStaff}>
                  <input placeholder="Nama" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} />
                  <input placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
                  <input placeholder="Telepon" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
                  <input placeholder="Password" type="password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} />
                  <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="btn" type="submit">Simpan</button>
                </form>
              </div>
              <div className="card">
                <h3>Daftar Admin/Staff</h3>
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Email</th><th>Role</th><th>Telepon</th></tr>
                  </thead>
                  <tbody>
                    {staff.map(s => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.email}</td>
                        <td>{s.role}</td>
                        <td>{s.phone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'voucher' && (
            <div>
              <div className="card">
                <h3>Buat Voucher</h3>
                <form className="form-grid" onSubmit={submitVoucher}>
                  <input placeholder="Kode" value={voucherForm.code} onChange={(e) => setVoucherForm({ ...voucherForm, code: e.target.value })} />
                  <input placeholder="Judul" value={voucherForm.title} onChange={(e) => setVoucherForm({ ...voucherForm, title: e.target.value })} />
                  <select value={voucherForm.discount_type} onChange={(e) => setVoucherForm({ ...voucherForm, discount_type: e.target.value })}>
                    <option value="flat">Flat</option>
                    <option value="percent">Persen</option>
                  </select>
                  <input placeholder="Nilai" type="number" value={voucherForm.discount_value} onChange={(e) => setVoucherForm({ ...voucherForm, discount_value: Number(e.target.value) })} />
                  <input placeholder="Min belanja" type="number" value={voucherForm.min_spend} onChange={(e) => setVoucherForm({ ...voucherForm, min_spend: Number(e.target.value) })} />
                  <input placeholder="Max use (0 = unlimited)" type="number" value={voucherForm.max_uses} onChange={(e) => setVoucherForm({ ...voucherForm, max_uses: Number(e.target.value) })} />
                  <input placeholder="Expire date (YYYY-MM-DD)" value={voucherForm.expires_at} onChange={(e) => setVoucherForm({ ...voucherForm, expires_at: e.target.value })} />
                  <button className="btn" type="submit">Simpan</button>
                </form>
              </div>
              <div className="card">
                <h3>Voucher Aktif</h3>
                <table className="table">
                  <thead>
                    <tr><th>Kode</th><th>Judul</th><th>Jenis</th><th>Nilai</th><th>Min</th><th>Uses</th></tr>
                  </thead>
                  <tbody>
                    {vouchers.map(v => (
                      <tr key={v.code}>
                        <td>{v.code}</td>
                        <td>{v.title}</td>
                        <td>{v.discount_type}</td>
                        <td>{v.discount_value}</td>
                        <td>{v.min_spend}</td>
                        <td>{v.uses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'order' && (
            <div className="card">
              <h3>Order Terbaru</h3>
              <table className="table">
                <thead>
                  <tr><th>ID</th><th>Nama</th><th>Total</th><th>Status</th><th>Update</th><th>Member</th><th>Tier</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td>{o.id}</td>
                      <td>{o.customer_name}</td>
                      <td>{o.total}</td>
                      <td>{o.status}</td>
                      <td>
                        <select onChange={(e) => updateOrderStatus(o.id, e.target.value)} defaultValue="">
                          <option value="" disabled>Pilih</option>
                          <option value="PENDING">PENDING</option>
                          <option value="PAID">PAID</option>
                          <option value="FAILED">FAILED</option>
                        </select>
                      </td>
                      <td>{o.member_name}</td>
                      <td>{o.member_tier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
