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
  const [zones, setZones] = useState([])
  const [deliverySettings, setDeliverySettings] = useState({ base_lat: -6.2216339332113595, base_lng: 106.34573045889455, per_km_rate: 3000, min_fee: 8000 })
  const [productForm, setProductForm] = useState({ name: '', description: '', price: 0, stock: 0, category: '' })
  const [productEditId, setProductEditId] = useState('')
  const [productFile, setProductFile] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({ doctor_name: '', day_of_week: 'Senin', start_time: '09:00', end_time: '16:00', location: 'Petshop Bento - Cikande' })
  const [scheduleEditId, setScheduleEditId] = useState('')
  const [voucherForm, setVoucherForm] = useState({ code: '', title: '', discount_type: 'flat', discount_value: 0, min_spend: 0, max_uses: 0, expires_at: '', active: true })
  const [voucherEditCode, setVoucherEditCode] = useState('')
  const [staffForm, setStaffForm] = useState({ name: '', email: '', phone: '', password: '', role: 'staff' })
  const [staffEditId, setStaffEditId] = useState('')
  const [zoneForm, setZoneForm] = useState({ name: '', flat_fee: 0, active: true })
  const [zoneEditId, setZoneEditId] = useState('')

  const adminHeaders = adminToken ? { 'X-Auth-Token': adminToken } : {}
  const bookingAdminHeaders = BOOKING_ADMIN_SECRET ? { 'X-Admin-Secret': BOOKING_ADMIN_SECRET } : {}

  const load = () => {
    fetch(`${CORE_API}/products`, { headers: adminHeaders }).then(r => r.json()).then(setProducts).catch(() => setProducts([]))
    fetch(`${BOOKING_API}/schedules`).then(r => r.json()).then(setSchedules).catch(() => setSchedules([]))
    fetch(`${CORE_API}/admin/members`, { headers: adminHeaders }).then(r => r.json()).then(setMembers).catch(() => setMembers([]))
    fetch(`${CORE_API}/admin/orders`, { headers: adminHeaders }).then(r => r.json()).then(setOrders).catch(() => setOrders([]))
    fetch(`${CORE_API}/admin/vouchers`, { headers: adminHeaders }).then(r => r.json()).then(setVouchers).catch(() => setVouchers([]))
    fetch(`${CORE_API}/admin/staff`, { headers: adminHeaders }).then(r => r.json()).then(setStaff).catch(() => setStaff([]))
    fetch(`${CORE_API}/admin/delivery/zones`, { headers: adminHeaders }).then(r => r.json()).then(setZones).catch(() => setZones([]))
    fetch(`${CORE_API}/admin/delivery/settings`, { headers: adminHeaders }).then(r => r.json()).then(data => { if (!data.error) setDeliverySettings(data) }).catch(() => {})
    fetch(`${BOOKING_API}/admin/appointments`, { headers: bookingAdminHeaders }).then(r => r.json()).then(setAppointments).catch(() => setAppointments([]))
    fetch(`${BOOKING_API}/admin/service-bookings`, { headers: bookingAdminHeaders }).then(r => r.json()).then(setServiceBookings).catch(() => setServiceBookings([]))
  }

  useEffect(() => {
    if (adminToken) load()
  }, [adminToken])

  const submitProduct = async (e) => {
    e.preventDefault()
    const targetId = productEditId
    const resp = await fetch(targetId ? `${CORE_API}/admin/products/${targetId}` : `${CORE_API}/products`, {
      method: targetId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify(productForm)
    })
    const data = await resp.json().catch(() => ({}))
    const productId = targetId || data.product_id
    if (productId && productFile) {
      const formData = new FormData()
      formData.append('image', productFile)
      await fetch(`${CORE_API}/admin/products/${productId}/image`, {
        method: 'POST',
        headers: { ...adminHeaders },
        body: formData
      })
    }
    setProductForm({ name: '', description: '', price: 0, stock: 0, category: '' })
    setProductEditId('')
    setProductFile(null)
    load()
  }

  const submitSchedule = (e) => {
    e.preventDefault()
    fetch(scheduleEditId ? `${BOOKING_API}/schedules/${scheduleEditId}` : `${BOOKING_API}/schedules`, {
      method: scheduleEditId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...bookingAdminHeaders },
      body: JSON.stringify(scheduleForm)
    }).then(() => {
      setScheduleForm({ doctor_name: '', day_of_week: 'Senin', start_time: '09:00', end_time: '16:00', location: 'Petshop Bento - Cikande' })
      setScheduleEditId('')
      load()
    })
  }

  const submitVoucher = (e) => {
    e.preventDefault()
    const targetCode = voucherEditCode || voucherForm.code
    fetch(voucherEditCode ? `${CORE_API}/admin/vouchers/${targetCode}` : `${CORE_API}/admin/vouchers`, {
      method: voucherEditCode ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify(voucherForm)
    }).then(() => {
      setVoucherForm({ code: '', title: '', discount_type: 'flat', discount_value: 0, min_spend: 0, max_uses: 0, expires_at: '', active: true })
      setVoucherEditCode('')
      load()
    })
  }

  const submitStaff = (e) => {
    e.preventDefault()
    fetch(staffEditId ? `${CORE_API}/admin/staff/${staffEditId}` : `${CORE_API}/admin/staff`, {
      method: staffEditId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify(staffForm)
    }).then(() => {
      setStaffForm({ name: '', email: '', phone: '', password: '', role: 'staff' })
      setStaffEditId('')
      load()
    })
  }

  const submitZone = (e) => {
    e.preventDefault()
    fetch(zoneEditId ? `${CORE_API}/admin/delivery/zones/${zoneEditId}` : `${CORE_API}/admin/delivery/zones`, {
      method: zoneEditId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify(zoneForm)
    }).then(() => {
      setZoneForm({ name: '', flat_fee: 0, active: true })
      setZoneEditId('')
      load()
    })
  }

  const saveDeliverySettings = (e) => {
    e.preventDefault()
    fetch(`${CORE_API}/admin/delivery/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminHeaders },
      body: JSON.stringify({
        base_lat: Number(deliverySettings.base_lat),
        base_lng: Number(deliverySettings.base_lng),
        per_km_rate: Number(deliverySettings.per_km_rate),
        min_fee: Number(deliverySettings.min_fee)
      })
    }).then(() => load())
  }

  const editProduct = (p) => {
    setProductForm({ name: p.name || '', description: p.description || '', price: p.price || 0, stock: p.stock || 0, category: p.category || '' })
    setProductEditId(p.id)
  }

  const deleteProduct = (id) => {
    fetch(`${CORE_API}/admin/products/${id}`, { method: 'DELETE', headers: { ...adminHeaders } }).then(() => load())
  }

  const editSchedule = (s) => {
    setScheduleForm({ doctor_name: s.doctor_name || '', day_of_week: s.day_of_week || 'Senin', start_time: s.start_time || '09:00', end_time: s.end_time || '16:00', location: s.location || '' })
    setScheduleEditId(s.id)
  }

  const deleteSchedule = (id) => {
    fetch(`${BOOKING_API}/schedules/${id}`, { method: 'DELETE', headers: { ...bookingAdminHeaders } }).then(() => load())
  }

  const editVoucher = (v) => {
    setVoucherForm({
      code: v.code || '',
      title: v.title || '',
      discount_type: v.discount_type || 'flat',
      discount_value: v.discount_value || 0,
      min_spend: v.min_spend || 0,
      max_uses: v.max_uses || 0,
      expires_at: v.expires_at || '',
      active: v.active ?? true
    })
    setVoucherEditCode(v.code)
  }

  const deleteVoucher = (code) => {
    fetch(`${CORE_API}/admin/vouchers/${code}`, { method: 'DELETE', headers: { ...adminHeaders } }).then(() => load())
  }

  const editStaff = (s) => {
    setStaffForm({ name: s.name || '', email: s.email || '', phone: s.phone || '', password: '', role: s.role || 'staff' })
    setStaffEditId(s.id)
  }

  const deleteStaff = (id) => {
    fetch(`${CORE_API}/admin/staff/${id}`, { method: 'DELETE', headers: { ...adminHeaders } }).then(() => load())
  }

  const editZone = (z) => {
    setZoneForm({ name: z.name || '', flat_fee: z.flat_fee || 0, active: z.active ?? true })
    setZoneEditId(z.id)
  }

  const deleteZone = (id) => {
    fetch(`${CORE_API}/admin/delivery/zones/${id}`, { method: 'DELETE', headers: { ...adminHeaders } }).then(() => load())
  }

  const updateAppointmentStatus = (id, status) => {
    if (!status) return
    fetch(`${BOOKING_API}/admin/appointments/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...bookingAdminHeaders },
      body: JSON.stringify({ status })
    }).then(() => load())
  }

  const updateServiceBookingStatus = (id, status) => {
    if (!status) return
    fetch(`${BOOKING_API}/admin/service-bookings/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...bookingAdminHeaders },
      body: JSON.stringify({ status })
    }).then(() => load())
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
    if (adminToken) {
      fetch(`${CORE_API}/auth/logout`, { method: 'POST', headers: { 'X-Auth-Token': adminToken } }).catch(() => {})
    }
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
          <button className={`nav-btn ${tab === 'delivery' ? 'active' : ''}`} onClick={() => setTab('delivery')}>Delivery</button>
          <button className={`nav-btn ${tab === 'voucher' ? 'active' : ''}`} onClick={() => setTab('voucher')}>Voucher</button>
          <button className={`nav-btn ${tab === 'order' ? 'active' : ''}`} onClick={() => setTab('order')}>Order</button>
        </aside>
        <main className="content">
          {tab === 'produk' && (
            <div>
              <div className="card">
                <h3>{productEditId ? 'Edit Produk' : 'Tambah Produk'}</h3>
                <form className="form-grid" onSubmit={submitProduct}>
                  <input placeholder="Nama" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                  <input placeholder="Deskripsi" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
                  <input placeholder="Harga" type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })} />
                  <input placeholder="Stok" type="number" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: Number(e.target.value) })} />
                  <input placeholder="Kategori" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} />
                  <input type="file" accept="image/*" onChange={(e) => setProductFile(e.target.files?.[0] || null)} />
                  <button className="btn" type="submit">{productEditId ? 'Update' : 'Simpan'}</button>
                  {productEditId && (
                    <button className="btn" type="button" onClick={() => { setProductForm({ name: '', description: '', price: 0, stock: 0, category: '' }); setProductEditId(''); setProductFile(null) }}>
                      Batal
                    </button>
                  )}
                </form>
              </div>
              <div className="card">
                <h3>Daftar Produk</h3>
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Kategori</th><th>Harga</th><th>Stok</th><th>Aksi</th></tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.category || '-'}</td>
                        <td>{p.price}</td>
                        <td>{p.stock}</td>
                        <td>
                          <button className="btn" type="button" onClick={() => editProduct(p)}>Edit</button>
                          <button className="btn" type="button" onClick={() => deleteProduct(p.id)}>Hapus</button>
                        </td>
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
                <h3>{scheduleEditId ? 'Edit Jadwal Dokter' : 'Tambah Jadwal Dokter'}</h3>
                <form className="form-grid" onSubmit={submitSchedule}>
                  <input placeholder="Nama Dokter" value={scheduleForm.doctor_name} onChange={(e) => setScheduleForm({ ...scheduleForm, doctor_name: e.target.value })} />
                  <select value={scheduleForm.day_of_week} onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: e.target.value })}>
                    {['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input type="time" value={scheduleForm.start_time} onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} />
                  <input type="time" value={scheduleForm.end_time} onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })} />
                  <input placeholder="Lokasi" value={scheduleForm.location} onChange={(e) => setScheduleForm({ ...scheduleForm, location: e.target.value })} />
                  <button className="btn" type="submit">{scheduleEditId ? 'Update' : 'Simpan'}</button>
                  {scheduleEditId && (
                    <button className="btn" type="button" onClick={() => { setScheduleForm({ doctor_name: '', day_of_week: 'Senin', start_time: '09:00', end_time: '16:00', location: 'Petshop Bento - Cikande' }); setScheduleEditId('') }}>
                      Batal
                    </button>
                  )}
                </form>
              </div>
              <div className="card">
                <h3>Jadwal Tersedia</h3>
                <table className="table">
                  <thead>
                    <tr><th>Dokter</th><th>Hari</th><th>Jam</th><th>Lokasi</th><th>Aksi</th></tr>
                  </thead>
                  <tbody>
                    {schedules.map(s => (
                      <tr key={s.id}>
                        <td>{s.doctor_name}</td>
                        <td>{s.day_of_week}</td>
                        <td>{s.start_time} - {s.end_time}</td>
                        <td>{s.location}</td>
                        <td>
                          <button className="btn" type="button" onClick={() => editSchedule(s)}>Edit</button>
                          <button className="btn" type="button" onClick={() => deleteSchedule(s.id)}>Hapus</button>
                        </td>
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
                    <tr><th>Nama</th><th>Telepon</th><th>Pet</th><th>Layanan</th><th>Status</th><th>Update</th></tr>
                  </thead>
                  <tbody>
                    {appointments.map(a => (
                      <tr key={a.id}>
                        <td>{a.customer_name}</td>
                        <td>{a.phone}</td>
                        <td>{a.pet_name}</td>
                        <td>{a.service_type}</td>
                        <td>{a.status}</td>
                        <td>
                          <select onChange={(e) => updateAppointmentStatus(a.id, e.target.value)} defaultValue="">
                            <option value="" disabled>Pilih</option>
                            <option value="BOOKED">BOOKED</option>
                            <option value="DONE">DONE</option>
                            <option value="CANCELED">CANCELED</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card">
                <h3>Grooming dan Penitipan</h3>
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Telepon</th><th>Layanan</th><th>Tanggal</th><th>Status</th><th>Update</th></tr>
                  </thead>
                  <tbody>
                    {serviceBookings.map(b => (
                      <tr key={b.id}>
                        <td>{b.customer_name}</td>
                        <td>{b.phone}</td>
                        <td>{b.service_type}</td>
                        <td>{b.date}</td>
                        <td>{b.status}</td>
                        <td>
                          <select onChange={(e) => updateServiceBookingStatus(b.id, e.target.value)} defaultValue="">
                            <option value="" disabled>Pilih</option>
                            <option value="BOOKED">BOOKED</option>
                            <option value="DONE">DONE</option>
                            <option value="CANCELED">CANCELED</option>
                          </select>
                        </td>
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
                <h3>{staffEditId ? 'Edit Staff/Admin' : 'Tambah Staff/Admin'}</h3>
                <form className="form-grid" onSubmit={submitStaff}>
                  <input placeholder="Nama" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} />
                  <input placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
                  <input placeholder="Telepon" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
                  <input placeholder="Password" type="password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} />
                  <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button className="btn" type="submit">{staffEditId ? 'Update' : 'Simpan'}</button>
                  {staffEditId && (
                    <button className="btn" type="button" onClick={() => { setStaffForm({ name: '', email: '', phone: '', password: '', role: 'staff' }); setStaffEditId('') }}>
                      Batal
                    </button>
                  )}
                </form>
              </div>
              <div className="card">
                <h3>Daftar Admin/Staff</h3>
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Email</th><th>Role</th><th>Telepon</th><th>Aksi</th></tr>
                  </thead>
                  <tbody>
                    {staff.map(s => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.email}</td>
                        <td>{s.role}</td>
                        <td>{s.phone}</td>
                        <td>
                          <button className="btn" type="button" onClick={() => editStaff(s)}>Edit</button>
                          <button className="btn" type="button" onClick={() => deleteStaff(s.id)}>Hapus</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'delivery' && (
            <div>
              <div className="card">
                <h3>Delivery Settings (Per KM)</h3>
                <form className="form-grid" onSubmit={saveDeliverySettings}>
                  <input placeholder="Base Lat" value={deliverySettings.base_lat} onChange={(e) => setDeliverySettings({ ...deliverySettings, base_lat: e.target.value })} />
                  <input placeholder="Base Lng" value={deliverySettings.base_lng} onChange={(e) => setDeliverySettings({ ...deliverySettings, base_lng: e.target.value })} />
                  <input placeholder="Rate per KM" type="number" value={deliverySettings.per_km_rate} onChange={(e) => setDeliverySettings({ ...deliverySettings, per_km_rate: e.target.value })} />
                  <input placeholder="Min Fee" type="number" value={deliverySettings.min_fee} onChange={(e) => setDeliverySettings({ ...deliverySettings, min_fee: e.target.value })} />
                  <button className="btn" type="submit">Simpan</button>
                </form>
              </div>
              <div className="card">
                <h3>{zoneEditId ? 'Edit Zone (Flat Fee)' : 'Tambah Zone (Flat Fee)'}</h3>
                <form className="form-grid" onSubmit={submitZone}>
                  <input placeholder="Nama Zone" value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} />
                  <input placeholder="Flat Fee" type="number" value={zoneForm.flat_fee} onChange={(e) => setZoneForm({ ...zoneForm, flat_fee: Number(e.target.value) })} />
                  <select value={zoneForm.active ? 'true' : 'false'} onChange={(e) => setZoneForm({ ...zoneForm, active: e.target.value === 'true' })}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                  <button className="btn" type="submit">{zoneEditId ? 'Update' : 'Simpan'}</button>
                  {zoneEditId && (
                    <button className="btn" type="button" onClick={() => { setZoneForm({ name: '', flat_fee: 0, active: true }); setZoneEditId('') }}>
                      Batal
                    </button>
                  )}
                </form>
              </div>
              <div className="card">
                <h3>Daftar Zone</h3>
                <table className="table">
                  <thead>
                    <tr><th>Zone</th><th>Flat Fee</th><th>Active</th><th>Aksi</th></tr>
                  </thead>
                  <tbody>
                    {zones.map(z => (
                      <tr key={z.id}>
                        <td>{z.name}</td>
                        <td>{z.flat_fee}</td>
                        <td>{z.active ? 'Yes' : 'No'}</td>
                        <td>
                          <button className="btn" type="button" onClick={() => editZone(z)}>Edit</button>
                          <button className="btn" type="button" onClick={() => deleteZone(z.id)}>Hapus</button>
                        </td>
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
                <h3>{voucherEditCode ? 'Edit Voucher' : 'Buat Voucher'}</h3>
                <form className="form-grid" onSubmit={submitVoucher}>
                  <input placeholder="Kode" value={voucherForm.code} disabled={!!voucherEditCode} onChange={(e) => setVoucherForm({ ...voucherForm, code: e.target.value })} />
                  <input placeholder="Judul" value={voucherForm.title} onChange={(e) => setVoucherForm({ ...voucherForm, title: e.target.value })} />
                  <select value={voucherForm.discount_type} onChange={(e) => setVoucherForm({ ...voucherForm, discount_type: e.target.value })}>
                    <option value="flat">Flat</option>
                    <option value="percent">Persen</option>
                  </select>
                  <input placeholder="Nilai" type="number" value={voucherForm.discount_value} onChange={(e) => setVoucherForm({ ...voucherForm, discount_value: Number(e.target.value) })} />
                  <input placeholder="Min belanja" type="number" value={voucherForm.min_spend} onChange={(e) => setVoucherForm({ ...voucherForm, min_spend: Number(e.target.value) })} />
                  <input placeholder="Max use (0 = unlimited)" type="number" value={voucherForm.max_uses} onChange={(e) => setVoucherForm({ ...voucherForm, max_uses: Number(e.target.value) })} />
                  <input placeholder="Expire date (YYYY-MM-DD)" value={voucherForm.expires_at} onChange={(e) => setVoucherForm({ ...voucherForm, expires_at: e.target.value })} />
                  <select value={voucherForm.active ? 'true' : 'false'} onChange={(e) => setVoucherForm({ ...voucherForm, active: e.target.value === 'true' })}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                  <button className="btn" type="submit">{voucherEditCode ? 'Update' : 'Simpan'}</button>
                  {voucherEditCode && (
                    <button className="btn" type="button" onClick={() => { setVoucherForm({ code: '', title: '', discount_type: 'flat', discount_value: 0, min_spend: 0, max_uses: 0, expires_at: '', active: true }); setVoucherEditCode('') }}>
                      Batal
                    </button>
                  )}
                </form>
              </div>
              <div className="card">
                <h3>Voucher Aktif</h3>
                <table className="table">
                  <thead>
                    <tr><th>Kode</th><th>Judul</th><th>Jenis</th><th>Nilai</th><th>Min</th><th>Uses</th><th>Active</th><th>Aksi</th></tr>
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
                        <td>{v.active ? 'Yes' : 'No'}</td>
                        <td>
                          <button className="btn" type="button" onClick={() => editVoucher(v)}>Edit</button>
                          <button className="btn" type="button" onClick={() => deleteVoucher(v.code)}>Hapus</button>
                        </td>
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
