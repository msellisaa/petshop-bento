import React, { useEffect, useMemo, useState } from 'react'

const CORE_API = import.meta.env.VITE_CORE_API || 'http://localhost:8081'
const BOOKING_API = import.meta.env.VITE_BOOKING_API || 'http://localhost:8082'

const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(n || 0)

export default function App() {
  const [products, setProducts] = useState([])
  const [schedules, setSchedules] = useState([])
  const [zones, setZones] = useState([])
  const [cartId, setCartId] = useState('')
  const [cartItems, setCartItems] = useState([])
  const [token, setToken] = useState(localStorage.getItem('auth_token') || '')
  const [user, setUser] = useState(null)
  const [myVouchers, setMyVouchers] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [checkout, setCheckout] = useState({ name: '', phone: '', address: '', voucher_code: '', wallet_use: 0 })
  const [deliveryType, setDeliveryType] = useState('zone')
  const [deliveryInput, setDeliveryInput] = useState({ zone_id: '', lat: '', lng: '', distance_km: '' })
  const [shippingFee, setShippingFee] = useState(0)
  const [quoteInfo, setQuoteInfo] = useState(null)
  const [orderInfo, setOrderInfo] = useState(null)
  const [snapUrl, setSnapUrl] = useState('')
  const [paymentStatus, setPaymentStatus] = useState(null)

  useEffect(() => {
    fetch(`${CORE_API}/products`).then(r => r.json()).then(setProducts).catch(() => setProducts([]))
    fetch(`${BOOKING_API}/schedules`).then(r => r.json()).then(setSchedules).catch(() => setSchedules([]))
    fetch(`${CORE_API}/delivery/zones`).then(r => r.json()).then(setZones).catch(() => setZones([]))
  }, [])

  useEffect(() => {
    if (!token) return
    fetch(`${CORE_API}/me`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) setUser(data)
      })
    fetch(`${CORE_API}/me/vouchers`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setMyVouchers(data)
      })
    fetch(`${CORE_API}/me/orders`, { headers: { 'X-Auth-Token': token } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setMyOrders(data)
      })
  }, [token])

  const subtotal = useMemo(() => cartItems.reduce((acc, item) => acc + item.price * item.qty, 0), [cartItems])

  const addToCart = async (product) => {
    const body = { cart_id: cartId, product_id: product.id, qty: 1 }
    const resp = await fetch(`${CORE_API}/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await resp.json()
    const nextCartId = data.cart_id || cartId
    setCartId(nextCartId)
    const existing = cartItems.find(i => i.product_id === product.id)
    if (existing) {
      setCartItems(cartItems.map(i => i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i))
    } else {
      setCartItems([...cartItems, { product_id: product.id, name: product.name, price: product.price, qty: 1 }])
    }
  }

  const submitLogin = async (e) => {
    e.preventDefault()
    const resp = await fetch(`${CORE_API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm)
    })
    const data = await resp.json()
    if (data.token) {
      localStorage.setItem('auth_token', data.token)
      setToken(data.token)
      setUser(data.user)
    }
  }

  const submitRegister = async (e) => {
    e.preventDefault()
    const resp = await fetch(`${CORE_API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerForm)
    })
    const data = await resp.json()
    if (data.user_id) {
      setRegisterForm({ name: '', email: '', phone: '', password: '' })
    }
  }

  const submitOrder = async (e) => {
    e.preventDefault()
    if (!cartId) return
    const resp = await fetch(`${CORE_API}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Auth-Token': token } : {})
      },
      body: JSON.stringify({
        cart_id: cartId,
        customer_name: checkout.name,
        phone: checkout.phone,
        address: checkout.address,
        shipping_fee: shippingFee,
        voucher_code: checkout.voucher_code,
        wallet_use: Number(checkout.wallet_use || 0)
      })
    })
    const data = await resp.json()
    if (!data.error) {
      setOrderInfo(data)
      setSnapUrl('')
      setPaymentStatus(null)
      if (token) {
        const me = await fetch(`${CORE_API}/me`, { headers: { 'X-Auth-Token': token } }).then(r => r.json())
        if (!me.error) setUser(me)
        const orders = await fetch(`${CORE_API}/me/orders`, { headers: { 'X-Auth-Token': token } }).then(r => r.json())
        if (Array.isArray(orders)) setMyOrders(orders)
      }
    }
  }

  const requestMidtrans = async () => {
    if (!orderInfo) return
    const resp = await fetch(`${BOOKING_API}/payments/midtrans/snap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: orderInfo.order_id,
        gross_amount: orderInfo.total,
        first_name: checkout.name,
        phone: checkout.phone,
        email: user?.email || 'guest@petshop.local',
        items: cartItems.map(i => ({ id: i.product_id, name: i.name, price: i.price, quantity: i.qty }))
      })
    })
    const data = await resp.json()
    if (data.redirect_url) setSnapUrl(data.redirect_url)
  }

  const requestQuote = async () => {
    const payload = {
      type: deliveryType,
      zone_id: deliveryInput.zone_id,
      lat: Number(deliveryInput.lat || 0),
      lng: Number(deliveryInput.lng || 0),
      distance_km: Number(deliveryInput.distance_km || 0)
    }
    const resp = await fetch(`${CORE_API}/delivery/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await resp.json()
    if (!data.error) {
      setShippingFee(data.fee || 0)
      setQuoteInfo(data)
    }
  }

  const checkStatus = async () => {
    if (!orderInfo) return
    const resp = await fetch(`${BOOKING_API}/payments/midtrans/status/${orderInfo.order_id}`)
    const data = await resp.json()
    setPaymentStatus(data)
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    setToken('')
    setUser(null)
  }

  return (
    <div>
      <header className="container nav">
        <div className="brand">Petshop Bento</div>
        <nav className="nav-links">
          <a href="#produk">Produk</a>
          <a href="#layanan">Layanan</a>
          <a href="#dokter">Jadwal Dokter</a>
          <a href="#member">Member</a>
          <a href="#lokasi">Lokasi</a>
        </nav>
      </header>

      <section className="container hero">
        <div>
          <h1>Semua kebutuhan kucing, dari makanan sampai dokter.</h1>
          <p>
            Petshop Bento melayani makanan kucing, obat dan vitamin, minuman, pasir, kandang, tas, serta
            layanan grooming, penitipan, konsultasi gratis, dan vaksin.
          </p>
          <div className="cta-row">
            <button className="btn btn-primary">Belanja Online</button>
            <button className="btn btn-outline">Booking Layanan</button>
          </div>
          <div className="badges">
            <span className="badge">Pengiriman cepat Cikande dan sekitar</span>
            <span className="badge">Payment Gateway Midtrans</span>
            <span className="badge">Konsultasi gratis</span>
          </div>
        </div>
        <div className="hero-card">
          <h3>Jam Operasional</h3>
          <p>Senin - Minggu, 08:00 - 20:00</p>
          <div className="strip">
            <span className="chip">+62 896-4385-2920</span>
            <span className="chip">Jl. Cikande Permai No.11-12 Blok L9</span>
          </div>
        </div>
      </section>

      <section id="produk" className="section container">
        <div className="section-head">
          <h2>Produk Favorit</h2>
          <div className="cart-summary">Keranjang: {cartItems.length} item | {rupiah(subtotal)}</div>
        </div>
        <div className="grid grid-3">
          {(products.length ? products : demoProducts).map(p => (
            <div className="card" key={p.id || p.name}>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <div className="price">{rupiah(p.price)}</div>
              <small>Stok: {p.stock}</small>
              <button className="btn btn-primary" onClick={() => addToCart(p)}>Tambah ke keranjang</button>
            </div>
          ))}
        </div>
      </section>

      <section id="member" className="section container">
        <h2>Member dan Reward</h2>
        <div className="grid grid-2">
          <div className="card">
            <h3>Status Member</h3>
            {user ? (
              <div className="member-info">
                <p><strong>{user.name}</strong> ({user.tier})</p>
                <p>Total belanja: {rupiah(user.total_spend)}</p>
                <p>Saldo cashback: {rupiah(user.wallet_balance)}</p>
                {myVouchers.length > 0 && (
                  <div className="voucher-list">
                    <p>Voucher kamu:</p>
                    <ul>
                      {myVouchers.map(v => (
                        <li key={v.code}>{v.code} - {v.title} {v.used ? '(terpakai)' : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {myOrders.length > 0 && (
                  <div className="voucher-list">
                    <p>Riwayat belanja:</p>
                    <ul>
                      {myOrders.slice(0, 5).map(o => (
                        <li key={o.id}>#{o.id.slice(0, 6)} - {rupiah(o.total)} ({o.status})</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button className="btn btn-outline" onClick={logout}>Keluar</button>
              </div>
            ) : (
              <p>Masuk untuk melihat tier dan reward.</p>
            )}
            <div className="strip">
              <span className="chip">Bronze: 0 persen</span>
              <span className="chip">Silver: diskon 2 persen, cashback 1 persen</span>
              <span className="chip">Gold: diskon 4 persen, cashback 2 persen</span>
              <span className="chip">Platinum: diskon 7 persen, cashback 3 persen</span>
            </div>
          </div>
          <div className="card">
            <h3>Login Member</h3>
            <form className="form-grid" onSubmit={submitLogin}>
              <input placeholder="Email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
              <input placeholder="Password" type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
              <button className="btn" type="submit">Masuk</button>
            </form>
            <h3>Daftar Member Baru</h3>
            <form className="form-grid" onSubmit={submitRegister}>
              <input placeholder="Nama" value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} />
              <input placeholder="Email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} />
              <input placeholder="Telepon" value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} />
              <input placeholder="Password" type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
              <button className="btn" type="submit">Daftar</button>
            </form>
          </div>
        </div>
      </section>

      {user && (
        <section className="section container">
          <h2>Riwayat Pesanan</h2>
          <div className="card">
            {myOrders.length === 0 ? (
              <p>Belum ada pesanan.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Subtotal</th>
                    <th>Diskon</th>
                    <th>Cashback</th>
                    <th>Pakai Cashback</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {myOrders.map(o => (
                    <tr key={o.id}>
                      <td>{o.id.slice(0, 6)}</td>
                      <td>{rupiah(o.subtotal)}</td>
                      <td>{rupiah(o.discount)}</td>
                      <td>{rupiah(o.cashback)}</td>
                      <td>{rupiah(o.wallet_used)}</td>
                      <td>{rupiah(o.total)}</td>
                      <td>{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <section className="section container">
        <h2>Checkout dan Voucher</h2>
        <div className="grid grid-2">
          <div className="card">
            <h3>Ringkasan Keranjang</h3>
            {cartItems.length === 0 ? <p>Keranjang kosong.</p> : (
              <ul className="cart-list">
                {cartItems.map(item => (
                  <li key={item.product_id}>{item.name} x {item.qty} = {rupiah(item.price * item.qty)}</li>
                ))}
              </ul>
            )}
            <p><strong>Subtotal: {rupiah(subtotal)}</strong></p>
            <p>Ongkir: {rupiah(shippingFee)}</p>
            <p><strong>Estimasi total: {rupiah(subtotal + shippingFee)}</strong></p>
          </div>
          <div className="card">
            <h3>Buat Pesanan</h3>
            <form className="form-grid" onSubmit={submitOrder}>
              <input placeholder="Nama" value={checkout.name} onChange={(e) => setCheckout({ ...checkout, name: e.target.value })} />
              <input placeholder="Telepon" value={checkout.phone} onChange={(e) => setCheckout({ ...checkout, phone: e.target.value })} />
              <input placeholder="Alamat" value={checkout.address} onChange={(e) => setCheckout({ ...checkout, address: e.target.value })} />
              <input placeholder="Kode voucher (opsional)" value={checkout.voucher_code} onChange={(e) => setCheckout({ ...checkout, voucher_code: e.target.value })} />
              <div className="delivery-box">
                <label>Metode Pengiriman</label>
                <select value={deliveryType} onChange={(e) => setDeliveryType(e.target.value)}>
                  <option value="zone">Tarif Flat (Zona)</option>
                  <option value="per_km">Tarif per KM</option>
                  <option value="external">Ongkir Eksternal</option>
                </select>
                {deliveryType === 'zone' && (
                  <select value={deliveryInput.zone_id} onChange={(e) => setDeliveryInput({ ...deliveryInput, zone_id: e.target.value })}>
                    <option value="">Pilih Zona</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name} - {rupiah(z.flat_fee)}</option>)}
                  </select>
                )}
                {deliveryType !== 'zone' && (
                  <>
                    <input placeholder="Latitude" value={deliveryInput.lat} onChange={(e) => setDeliveryInput({ ...deliveryInput, lat: e.target.value })} />
                    <input placeholder="Longitude" value={deliveryInput.lng} onChange={(e) => setDeliveryInput({ ...deliveryInput, lng: e.target.value })} />
                  </>
                )}
                {deliveryType === 'per_km' && (
                  <input placeholder="Distance (km, optional)" value={deliveryInput.distance_km} onChange={(e) => setDeliveryInput({ ...deliveryInput, distance_km: e.target.value })} />
                )}
                <button type="button" className="btn btn-outline" onClick={requestQuote}>Hitung Ongkir</button>
                {quoteInfo && <small>Ongkir: {rupiah(quoteInfo.fee)} {quoteInfo.distance_km ? `(${quoteInfo.distance_km.toFixed(2)} km)` : ''}</small>}
              </div>
              <input placeholder="Gunakan cashback (angka)" type="number" value={checkout.wallet_use} onChange={(e) => setCheckout({ ...checkout, wallet_use: Number(e.target.value) })} />
              <button className="btn" type="submit">Checkout</button>
            </form>
            {orderInfo && (
              <div className="order-info">
                <p>Order ID: {orderInfo.order_id}</p>
                <p>Diskon: {rupiah(orderInfo.discount)}</p>
                <p>Cashback: {rupiah(orderInfo.cashback)}</p>
                <p>Pakai cashback: {rupiah(orderInfo.wallet_used)}</p>
                <p>Total: {rupiah(orderInfo.total)}</p>
                <button className="btn btn-outline" onClick={requestMidtrans}>Bayar via Midtrans</button>
                <button className="btn btn-outline" onClick={checkStatus}>Cek Status</button>
                {snapUrl && <p>Link pembayaran: {snapUrl}</p>}
                {paymentStatus && <p>Status pembayaran: {paymentStatus.transaction_status || paymentStatus.status_message || 'unknown'}</p>}
              </div>
            )}
          </div>
        </div>
      </section>

      <section id="layanan" className="section container">
        <h2>Layanan Lengkap</h2>
        <div className="grid grid-3">
          {services.map(s => (
            <div className="card" key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="dokter" className="section container">
        <h2>Jadwal Dokter dan Vaksin</h2>
        <div className="grid grid-2">
          {(schedules.length ? schedules : demoSchedules).map(s => (
            <div className="card" key={s.id || s.doctor_name}>
              <h3>{s.doctor_name}</h3>
              <p>{s.day_of_week} | {s.start_time} - {s.end_time}</p>
              <small>{s.location}</small>
            </div>
          ))}
        </div>
      </section>

      <section id="lokasi" className="section container">
        <h2>Lokasi dan Pengiriman</h2>
        <div className="grid grid-2">
          <div className="card">
            <h3>Alamat</h3>
            <p>Jl. Cikande Permai No.11-12 Blok L9 Komp, Situterate, Kec. Cikande, Kabupaten Serang, Banten 42186</p>
            <p>Koordinat: -6.2216339332113595, 106.34573045889455</p>
            <p>Telp: +62 896-4385-2920</p>
          </div>
          <div className="card">
            <h3>Pengiriman dan Pembayaran</h3>
            <p>Pengiriman area Cikande dan sekitar. Bisa beli online dan bayar via Midtrans (transfer, e-wallet, kartu).</p>
            <div className="strip">
              <span className="chip">GoSend</span>
              <span className="chip">GrabExpress</span>
              <span className="chip">Kurir lokal</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer container">
        <div className="strip">
          <span>Petshop Bento 2026</span>
          <span>Konsultasi gratis via WhatsApp</span>
        </div>
      </footer>
    </div>
  )
}

const demoProducts = [
  { name: 'Whiskas Adult 1.2kg', description: 'Rasa tuna, kaya nutrisi', price: 68000, stock: 25 },
  { name: 'Vitamin Bulu Halus', description: 'Vitamin kulit dan bulu kucing', price: 42000, stock: 30 },
  { name: 'Pasir Kucing 10L', description: 'Aroma lembut, daya serap tinggi', price: 55000, stock: 18 }
]

const services = [
  { title: 'Grooming dan Mandi', desc: 'Paket mandi, potong kuku, pembersihan telinga.' },
  { title: 'Penitipan Kucing', desc: 'Kamar bersih, monitoring harian, update foto.' },
  { title: 'Konsultasi Gratis', desc: 'Tanya kesehatan, nutrisi, dan perawatan.' },
  { title: 'Vaksin dan Suntik', desc: 'Layanan dokter hewan berjadwal.' },
  { title: 'Perlengkapan Lengkap', desc: 'Kandang, tas, pasir, mainan, aksesoris.' },
  { title: 'Delivery', desc: 'Pengiriman cepat untuk semua produk.' }
]

const demoSchedules = [
  { doctor_name: 'Drh. Sinta', day_of_week: 'Senin', start_time: '09:00', end_time: '16:00', location: 'Petshop Bento - Cikande' }
]
