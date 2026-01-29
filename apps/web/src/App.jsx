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
  const [cartOpen, setCartOpen] = useState(false)
  const [token, setToken] = useState(localStorage.getItem('auth_token') || '')
  const [user, setUser] = useState(null)
  const [myVouchers, setMyVouchers] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ name: '', username: '', email: '', phone: '', password: '', avatar_url: '' })
  const [registerMethod, setRegisterMethod] = useState('email')
  const [avatarStatus, setAvatarStatus] = useState('')
  const [otpState, setOtpState] = useState({ code: '', token: '', message: '', sent: false, verified: false })
  const [googleForm, setGoogleForm] = useState({ email: '', name: '', phone: '', google_id: '' })
  const [googleStatus, setGoogleStatus] = useState('')
  const [googleConsent, setGoogleConsent] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', username: '', avatar_url: '' })
  const [profileStatus, setProfileStatus] = useState('')
  const [checkout, setCheckout] = useState({ name: '', phone: '', address: '', voucher_code: '', wallet_use: 0 })
  const [deliveryType, setDeliveryType] = useState('zone')
  const [deliveryInput, setDeliveryInput] = useState({ zone_id: '', lat: '', lng: '', distance_km: '' })
  const [shippingFee, setShippingFee] = useState(0)
  const [quoteInfo, setQuoteInfo] = useState(null)
  const [orderInfo, setOrderInfo] = useState(null)
  const [snapUrl, setSnapUrl] = useState('')
  const [paymentStatus, setPaymentStatus] = useState(null)
  const [appointmentForm, setAppointmentForm] = useState({ customer_name: '', phone: '', pet_name: '', service_type: 'Konsultasi', schedule_id: '' })
  const [appointmentStatus, setAppointmentStatus] = useState('')
  const [serviceForm, setServiceForm] = useState({ customer_name: '', phone: '', service_type: 'Grooming', notes: '', date: '' })
  const [serviceStatus, setServiceStatus] = useState('')

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

  useEffect(() => {
    if (!user) return
    setProfileForm({
      name: user.name || '',
      username: user.username || '',
      avatar_url: user.avatar_url || ''
    })
  }, [user])

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
    if (!otpState.token) {
      setOtpState({ ...otpState, message: 'OTP belum diverifikasi.' })
      return
    }
    const channel = registerMethod === 'email' ? 'email' : registerMethod
    const payload = {
      name: registerForm.name,
      username: registerForm.username,
      password: registerForm.password,
      avatar_url: registerForm.avatar_url,
      otp_token: otpState.token,
      otp_channel: channel
    }
    if (registerMethod !== 'email') {
      payload.phone = registerForm.phone
    } else {
      payload.email = registerForm.email
    }
    const resp = await fetch(`${CORE_API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await resp.json()
    if (data.user_id) {
      setRegisterForm({ name: '', username: '', email: '', phone: '', password: '', avatar_url: '' })
      setOtpState({ code: '', token: '', message: 'Registrasi berhasil.', sent: false, verified: false })
    } else if (data.error) {
      setOtpState({ ...otpState, message: data.error })
    }
  }

  const requestOtp = async () => {
    if (registerMethod !== 'email' && !registerForm.phone) {
      setOtpState({ ...otpState, message: 'Nomor WhatsApp/SMS wajib diisi sebelum OTP.' })
      return
    }
    if (registerMethod === 'email' && !registerForm.email) {
      setOtpState({ ...otpState, message: 'Email wajib diisi sebelum OTP.' })
      return
    }
    const channel = registerMethod === 'email' ? 'email' : registerMethod
    const resp = await fetch(`${CORE_API}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: registerMethod === 'email' ? registerForm.email : '',
        phone: registerMethod !== 'email' ? registerForm.phone : '',
        channel,
        purpose: 'register'
      })
    })
    const data = await resp.json()
    if (data.error) {
      setOtpState({ ...otpState, message: data.error })
      return
    }
    const message = data.otp ? `OTP dev: ${data.otp}` : 'OTP terkirim.'
    setOtpState({ ...otpState, sent: true, verified: false, token: '', message })
  }

  const verifyOtp = async () => {
    if (!otpState.code) {
      setOtpState({ ...otpState, message: 'Kode OTP wajib diisi.' })
      return
    }
    const channel = registerMethod === 'email' ? 'email' : registerMethod
    const resp = await fetch(`${CORE_API}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: registerMethod === 'email' ? registerForm.email : '',
        phone: registerMethod !== 'email' ? registerForm.phone : '',
        channel,
        purpose: 'register',
        code: otpState.code
      })
    })
    const data = await resp.json()
    if (data.otp_token) {
      setOtpState({ ...otpState, token: data.otp_token, verified: true, message: 'OTP terverifikasi.' })
    } else {
      setOtpState({ ...otpState, message: data.error || 'OTP tidak valid.' })
    }
  }

  const submitGoogle = async () => {
    setGoogleStatus('')
    if (!googleConsent) {
      setGoogleStatus('Setujui izin akses Google terlebih dulu.')
      return
    }
    const payload = {
      email: googleForm.email,
      name: googleForm.name,
      phone: googleForm.phone,
      google_id: googleForm.google_id || googleForm.email
    }
    const resp = await fetch(`${CORE_API}/auth/google/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await resp.json()
    if (data.token) {
      localStorage.setItem('auth_token', data.token)
      setToken(data.token)
      setUser(data.user)
      setGoogleStatus('Login Google berhasil.')
    } else {
      setGoogleStatus(data.error || 'Login Google gagal.')
    }
  }

  const uploadAvatar = async (file) => {
    if (!file) return
    setAvatarStatus('Mengunggah foto...')
    const body = new FormData()
    body.append('avatar', file)
    const resp = await fetch(`${CORE_API}/uploads/avatar`, {
      method: 'POST',
      body
    })
    const data = await resp.json()
    if (data.avatar_url) {
      setRegisterForm({ ...registerForm, avatar_url: data.avatar_url })
      setAvatarStatus('Foto profil terunggah.')
    } else {
      setAvatarStatus(data.error || 'Upload gagal.')
    }
  }

  const uploadProfileAvatar = async (file) => {
    if (!file) return
    setProfileStatus('Mengunggah foto...')
    const body = new FormData()
    body.append('avatar', file)
    const resp = await fetch(`${CORE_API}/uploads/avatar`, {
      method: 'POST',
      body
    })
    const data = await resp.json()
    if (data.avatar_url) {
      setProfileForm({ ...profileForm, avatar_url: data.avatar_url })
      setProfileStatus('Foto profil terunggah.')
    } else {
      setProfileStatus(data.error || 'Upload gagal.')
    }
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    if (!token) return
    setProfileStatus('')
    const resp = await fetch(`${CORE_API}/me/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify(profileForm)
    })
    const data = await resp.json()
    if (data.error) {
      setProfileStatus(data.error)
      return
    }
    setProfileStatus('Profil tersimpan.')
    const refreshed = await fetch(`${CORE_API}/me`, { headers: { 'X-Auth-Token': token } }).then(r => r.json())
    if (!refreshed.error) setUser(refreshed)
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
    const resp = await fetch(`${CORE_API}/payments/midtrans/snap`, {
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

  const checkStatus = async () => {
    if (!orderInfo) return
    const resp = await fetch(`${CORE_API}/payments/midtrans/status/${orderInfo.order_id}`)
    const data = await resp.json()
    setPaymentStatus(data)
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

  const submitAppointment = async (e) => {
    e.preventDefault()
    setAppointmentStatus('')
    if (!appointmentForm.schedule_id) {
      setAppointmentStatus('Pilih jadwal dokter dulu.')
      return
    }
    const resp = await fetch(`${BOOKING_API}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appointmentForm)
    })
    const data = await resp.json()
    if (data.appointment_id) {
      setAppointmentStatus('Booking konsultasi berhasil.')
      setAppointmentForm({ customer_name: '', phone: '', pet_name: '', service_type: 'Konsultasi', schedule_id: '' })
      return
    }
    setAppointmentStatus(data.error || 'Booking gagal.')
  }

  const submitServiceBooking = async (e) => {
    e.preventDefault()
    setServiceStatus('')
    if (!serviceForm.date) {
      setServiceStatus('Tanggal wajib diisi.')
      return
    }
    const resp = await fetch(`${BOOKING_API}/services/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serviceForm)
    })
    const data = await resp.json()
    if (data.booking_id) {
      setServiceStatus('Booking layanan berhasil.')
      setServiceForm({ customer_name: '', phone: '', service_type: 'Grooming', notes: '', date: '' })
      return
    }
    setServiceStatus(data.error || 'Booking gagal.')
  }

  const logout = () => {
    if (token) {
      fetch(`${CORE_API}/auth/logout`, { method: 'POST', headers: { 'X-Auth-Token': token } }).catch(() => {})
    }
    localStorage.removeItem('auth_token')
    setToken('')
    setUser(null)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Petshop Bento</div>
        <nav className="topnav">
          <a href="#produk">Produk</a>
          <a href="#layanan">Layanan</a>
          <a href="#booking">Booking</a>
          <a href="#delivery">Delivery</a>
          <a href="#member">Member</a>
          <a href="#dokter">Dokter</a>
        </nav>
        <div className="top-actions">
          <a className="pill" href="https://wa.me/6289643852920" target="_blank" rel="noreferrer">Chat WhatsApp</a>
          <button className="pill ghost" onClick={() => setCartOpen(true)}>Keranjang ({cartItems.length})</button>
        </div>
      </header>

      {cartOpen && (
        <div className="cart-overlay" onClick={() => setCartOpen(false)}>
          <aside className="cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cart-header">
              <strong>Keranjang</strong>
              <button className="pill ghost" onClick={() => setCartOpen(false)}>Tutup</button>
            </div>
            {cartItems.length === 0 ? (
              <p>Keranjang kosong.</p>
            ) : (
              <ul className="cart-list">
                {cartItems.map(item => (
                  <li key={item.product_id}>
                    {item.name} x {item.qty}
                    <span>{rupiah(item.price * item.qty)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="summary">
              <p>Subtotal <span>{rupiah(subtotal)}</span></p>
              <p>Ongkir <span>{rupiah(shippingFee)}</span></p>
              <p className="total">Total <span>{rupiah(subtotal + shippingFee)}</span></p>
            </div>
            <a className="btn primary" href="#checkout" onClick={() => setCartOpen(false)}>Checkout</a>
          </aside>
        </div>
      )}

      <section className="hero">
        <div className="hero-left">
          <p className="eyebrow">Petshop khusus kucing - Cikande</p>
          <h1>Belanja kebutuhan kucing, booking dokter, semua rapi dalam satu tempat.</h1>
          <p className="lead">
            Produk lengkap, layanan grooming dan penitipan, konsultasi gratis, plus pembayaran Midtrans.
            Desain pengalaman belanja yang terasa hangat dan percaya diri.
          </p>
          <div className="cta-row">
            <a className="btn primary" href="#produk">Belanja Sekarang</a>
            <a className="btn outline" href="#booking">Booking Layanan</a>
          </div>
          <div className="meta-row">
            <div>
              <strong>4.9/5</strong>
              <span>rating pelanggan</span>
            </div>
            <div>
              <strong>Same-day</strong>
              <span>pengiriman lokal</span>
            </div>
            <div>
              <strong>Gratis</strong>
              <span>konsultasi kucing</span>
            </div>
          </div>
        </div>
        <div className="hero-right">
          <div className="hero-card">
            <h3>Promo Minggu Ini</h3>
            <p>Diskon member + cashback otomatis saat checkout.</p>
            <div className="promo-grid">
              {promoTiles.map(tile => (
                <div className="promo" key={tile.title}>
                  <strong>{tile.title}</strong>
                  <span>{tile.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-card highlight">
            <h3>Petshop Bento</h3>
            <p>Jl. Cikande Permai No.11-12 Blok L9</p>
            <div className="hero-tags">
              <span>+62 896-4385-2920</span>
              <span>08:00 - 20:00</span>
              <span>Midtrans Ready</span>
            </div>
          </div>
        </div>
      </section>

      <section className="strip">
        {valueProps.map((v) => (
          <div className="strip-item" key={v.title}>
            <strong>{v.title}</strong>
            <p>{v.desc}</p>
          </div>
        ))}
      </section>

      <section id="produk" className="section">
        <div className="section-head">
          <div>
            <h2>Produk Favorit</h2>
            <p>Pilihan terbaik untuk makanan, vitamin, pasir, kandang, dan aksesori.</p>
          </div>
          <div className="cart-chip">
            Keranjang {cartItems.length} item - {rupiah(subtotal)}
          </div>
        </div>
        <div className="product-grid">
          {(products.length ? products : demoProducts).map(p => (
            <div className="product-card" key={p.id || p.name}>
              {p.image_url && <img className="product-img" src={`${CORE_API}${p.image_url}`} alt={p.name} />}
              <div className="product-top">
                <span className="cat-pill">{p.category || 'Kebutuhan Kucing'}</span>
                <span className="stock">Stok {p.stock}</span>
              </div>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <div className="price-row">
                <strong>{rupiah(p.price)}</strong>
                <button className="btn mini" onClick={() => addToCart(p)}>Tambah</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="delivery" className="section alt">
        <div className="section-head">
          <div>
            <h2>Delivery yang Fleksibel</h2>
            <p>Pilih ongkir per zona, per KM, atau provider eksternal.</p>
          </div>
          <div className="badge">Estimasi real-time</div>
        </div>
        <div className="delivery-grid">
          <div className="delivery-card">
            <h3>Hitung Ongkir</h3>
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
              <button type="button" className="btn outline" onClick={requestQuote}>Hitung Ongkir</button>
              {quoteInfo && <small>Ongkir: {rupiah(quoteInfo.fee)} {quoteInfo.distance_km ? `(${quoteInfo.distance_km.toFixed(2)} km)` : ''}</small>}
            </div>
          </div>
          <div className="delivery-card">
            <h3>Ringkasan Belanja</h3>
            {cartItems.length === 0 ? <p>Keranjang kosong.</p> : (
              <ul className="cart-list">
                {cartItems.map(item => (
                  <li key={item.product_id}>{item.name} x {item.qty} = {rupiah(item.price * item.qty)}</li>
                ))}
              </ul>
            )}
            <div className="summary">
              <p>Subtotal <span>{rupiah(subtotal)}</span></p>
              <p>Ongkir <span>{rupiah(shippingFee)}</span></p>
              <p className="total">Estimasi total <span>{rupiah(subtotal + shippingFee)}</span></p>
            </div>
          </div>
        </div>
      </section>

      <section id="checkout" className="section">
        <div className="section-head">
          <div>
            <h2>Checkout Cepat</h2>
            <p>Masukkan data, gunakan voucher, dan bayar dengan Midtrans.</p>
          </div>
          <div className="badge">Midtrans Ready</div>
        </div>
        <div className="checkout-grid">
          <div className="checkout-card">
            <h3>Data Pengiriman</h3>
            <form className="form-grid" onSubmit={submitOrder}>
              <input placeholder="Nama" value={checkout.name} onChange={(e) => setCheckout({ ...checkout, name: e.target.value })} />
              <input placeholder="Telepon" value={checkout.phone} onChange={(e) => setCheckout({ ...checkout, phone: e.target.value })} />
              <input placeholder="Alamat" value={checkout.address} onChange={(e) => setCheckout({ ...checkout, address: e.target.value })} />
              <input placeholder="Kode voucher (opsional)" value={checkout.voucher_code} onChange={(e) => setCheckout({ ...checkout, voucher_code: e.target.value })} />
              <input placeholder="Gunakan cashback (angka)" type="number" value={checkout.wallet_use} onChange={(e) => setCheckout({ ...checkout, wallet_use: Number(e.target.value) })} />
              <button className="btn primary" type="submit">Checkout</button>
            </form>
          </div>
          <div className="checkout-card">
            <h3>Informasi Order</h3>
            {orderInfo ? (
              <div className="order-info">
                <p>Order ID: {orderInfo.order_id}</p>
                <p>Diskon: {rupiah(orderInfo.discount)}</p>
                <p>Cashback: {rupiah(orderInfo.cashback)}</p>
                <p>Pakai cashback: {rupiah(orderInfo.wallet_used)}</p>
                <p>Total: {rupiah(orderInfo.total)}</p>
                <div className="row">
                  <button className="btn outline" onClick={requestMidtrans}>Bayar via Midtrans</button>
                  <button className="btn outline" onClick={checkStatus}>Cek Status</button>
                </div>
                {snapUrl && <p>Link pembayaran: {snapUrl}</p>}
                {paymentStatus && <p>Status pembayaran: {paymentStatus.transaction_status || paymentStatus.status_message || 'unknown'}</p>}
              </div>
            ) : (
              <p>Belum ada order.</p>
            )}
          </div>
        </div>
      </section>

      <section id="layanan" className="section alt">
        <div className="section-head">
          <div>
            <h2>Layanan Lengkap</h2>
            <p>Dari mandi sampai penitipan - semuanya friendly dan terjadwal.</p>
          </div>
          <div className="badge">Konsultasi gratis</div>
        </div>
        <div className="service-grid">
          {services.map(s => (
            <div className="service-card" key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="booking" className="section">
        <div className="section-head">
          <div>
            <h2>Booking Layanan</h2>
            <p>Isi data singkat untuk konsultasi dokter atau layanan grooming.</p>
          </div>
          <div className="badge">Tanpa antre</div>
        </div>
        <div className="checkout-grid">
          <div className="checkout-card">
            <h3>Appointment Dokter</h3>
            <form className="form-grid" onSubmit={submitAppointment}>
              <input placeholder="Nama" value={appointmentForm.customer_name} onChange={(e) => setAppointmentForm({ ...appointmentForm, customer_name: e.target.value })} />
              <input placeholder="Telepon" value={appointmentForm.phone} onChange={(e) => setAppointmentForm({ ...appointmentForm, phone: e.target.value })} />
              <input placeholder="Nama Pet" value={appointmentForm.pet_name} onChange={(e) => setAppointmentForm({ ...appointmentForm, pet_name: e.target.value })} />
              <input placeholder="Jenis Layanan" value={appointmentForm.service_type} onChange={(e) => setAppointmentForm({ ...appointmentForm, service_type: e.target.value })} />
              <select value={appointmentForm.schedule_id} onChange={(e) => setAppointmentForm({ ...appointmentForm, schedule_id: e.target.value })}>
                <option value="">Pilih Jadwal Dokter</option>
                {(schedules.length ? schedules : demoSchedules).map(s => (
                  <option key={s.id || s.doctor_name} value={s.id}>{s.doctor_name} - {s.day_of_week} {s.start_time}</option>
                ))}
              </select>
              <button className="btn primary" type="submit">Booking Dokter</button>
              {appointmentStatus && <small>{appointmentStatus}</small>}
            </form>
          </div>
          <div className="checkout-card">
            <h3>Grooming / Penitipan</h3>
            <form className="form-grid" onSubmit={submitServiceBooking}>
              <input placeholder="Nama" value={serviceForm.customer_name} onChange={(e) => setServiceForm({ ...serviceForm, customer_name: e.target.value })} />
              <input placeholder="Telepon" value={serviceForm.phone} onChange={(e) => setServiceForm({ ...serviceForm, phone: e.target.value })} />
              <input placeholder="Jenis Layanan" value={serviceForm.service_type} onChange={(e) => setServiceForm({ ...serviceForm, service_type: e.target.value })} />
              <input type="date" value={serviceForm.date} onChange={(e) => setServiceForm({ ...serviceForm, date: e.target.value })} />
              <input placeholder="Catatan (opsional)" value={serviceForm.notes} onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })} />
              <button className="btn primary" type="submit">Booking Layanan</button>
              {serviceStatus && <small>{serviceStatus}</small>}
            </form>
          </div>
        </div>
      </section>

      <section id="member" className="section">
        <div className="section-head">
          <div>
            <h2>Member dan Reward</h2>
            <p>Tier naik otomatis, voucher muncul saat sering belanja.</p>
          </div>
          <div className="badge">Bronze - Platinum</div>
        </div>
        <div className="member-grid">
          <div className="member-card">
            <h3>Status Member</h3>
            {user ? (
              <div className="member-info">
                <p><strong>{user.name}</strong> ({user.tier})</p>
                {user.username && <p>Username: {user.username}</p>}
                {user.avatar_url && <img className="avatar" src={user.avatar_url} alt="Avatar" />}
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
                <form className="form-grid" onSubmit={saveProfile}>
                  <input placeholder="Nama" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
                  <input placeholder="Username" value={profileForm.username} onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })} />
                  <input type="file" accept="image/*" onChange={(e) => uploadProfileAvatar(e.target.files?.[0])} />
                  {profileForm.avatar_url && <small>Foto tersimpan: {profileForm.avatar_url}</small>}
                  <small>Username bisa diubah selama 30 hari sejak daftar.</small>
                  {profileStatus && <small>{profileStatus}</small>}
                  <button className="btn outline" type="submit">Simpan Profil</button>
                </form>
                <button className="btn outline" onClick={logout}>Keluar</button>
              </div>
            ) : (
              <p>Masuk untuk melihat tier dan reward.</p>
            )}
            <div className="tier-row">
              <div>
                <strong>Bronze</strong>
                <span>0 persen</span>
              </div>
              <div>
                <strong>Silver</strong>
                <span>2 persen + 1 persen</span>
              </div>
              <div>
                <strong>Gold</strong>
                <span>4 persen + 2 persen</span>
              </div>
              <div>
                <strong>Platinum</strong>
                <span>7 persen + 3 persen</span>
              </div>
            </div>
          </div>
          <div className="member-card">
            <div className="auth-block">
              <h3>Login Member</h3>
              <form className="form-grid" onSubmit={submitLogin}>
                <input placeholder="Email atau No. WhatsApp" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
                <input placeholder="Password" type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
                <button className="btn">Masuk</button>
              </form>
            </div>
            <div className="auth-block">
              <h3>Daftar Member Baru</h3>
              <form className="form-grid" onSubmit={submitRegister}>
                <input placeholder="Nama" value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} />
                <input placeholder="Username" value={registerForm.username} onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })} />
                <select value={registerMethod} onChange={(e) => {
                  setRegisterMethod(e.target.value)
                  setOtpState({ code: '', token: '', message: '', sent: false, verified: false })
                }}>
                  <option value="email">Daftar via Email</option>
                  <option value="whatsapp">Daftar via WhatsApp</option>
                  <option value="sms">Daftar via SMS</option>
                </select>
                {registerMethod === 'email' ? (
                  <input placeholder="Email" value={registerForm.email} onChange={(e) => {
                    const email = e.target.value
                    setRegisterForm({ ...registerForm, email })
                    setOtpState({ ...otpState, token: '', verified: false, sent: false, message: '' })
                  }} />
                ) : (
                  <input placeholder="Nomor WhatsApp/SMS" value={registerForm.phone} onChange={(e) => {
                    const phone = e.target.value
                    setRegisterForm({ ...registerForm, phone })
                    setOtpState({ ...otpState, token: '', verified: false, sent: false, message: '' })
                  }} />
                )}
                <input placeholder="Password" type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
                <input type="file" accept="image/*" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
                {registerForm.avatar_url && <small>Foto tersimpan: {registerForm.avatar_url}</small>}
                {avatarStatus && <small>{avatarStatus}</small>}
                <button className="btn outline" type="button" onClick={requestOtp}>Kirim OTP</button>
                <input placeholder="Kode OTP" value={otpState.code} onChange={(e) => setOtpState({ ...otpState, code: e.target.value })} />
                <button className="btn outline" type="button" onClick={verifyOtp}>Verifikasi OTP</button>
                {otpState.message && <small>{otpState.message}</small>}
                <button className="btn" disabled={!otpState.verified}>Daftar</button>
              </form>
            </div>
            <div className="auth-block">
              <h3>Google Sign-in</h3>
              <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submitGoogle() }}>
                <input placeholder="Email Google" value={googleForm.email} onChange={(e) => setGoogleForm({ ...googleForm, email: e.target.value })} />
                <input placeholder="Nama" value={googleForm.name} onChange={(e) => setGoogleForm({ ...googleForm, name: e.target.value })} />
                <input placeholder="Telepon" value={googleForm.phone} onChange={(e) => setGoogleForm({ ...googleForm, phone: e.target.value })} />
                <input placeholder="Google ID (opsional)" value={googleForm.google_id} onChange={(e) => setGoogleForm({ ...googleForm, google_id: e.target.value })} />
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={googleConsent}
                    onChange={(e) => setGoogleConsent(e.target.checked)}
                  />
                  <span>Saya setuju izin akses Google untuk login/daftar.</span>
                </label>
                <button className="btn" type="submit" disabled={!googleConsent}>Login/Daftar dengan Google</button>
                {googleStatus && <small>{googleStatus}</small>}
              </form>
              <small>Daftar Google tidak butuh OTP.</small>
            </div>
          </div>
        </div>
      </section>

      {user && (
        <section className="section alt">
          <div className="section-head">
            <div>
              <h2>Riwayat Pesanan</h2>
              <p>Detail transaksi member Petshop Bento.</p>
            </div>
            <div className="badge">Aman dan transparan</div>
          </div>
          <div className="table-card">
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

      <section id="dokter" className="section">
        <div className="section-head">
          <div>
            <h2>Jadwal Dokter dan Vaksin</h2>
            <p>Booking konsultasi sesuai jadwal tersedia.</p>
          </div>
          <div className="badge">Dokter hewan berpengalaman</div>
        </div>
        <div className="doctor-grid">
          {(schedules.length ? schedules : demoSchedules).map(s => (
            <div className="doctor-card" key={s.id || s.doctor_name}>
              <h3>{s.doctor_name}</h3>
              <p>{s.day_of_week} | {s.start_time} - {s.end_time}</p>
              <small>{s.location}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="section alt">
        <div className="section-head">
          <div>
            <h2>Lokasi dan Kontak</h2>
            <p>Datang langsung atau kirim via kurir lokal.</p>
          </div>
          <div className="badge">Cikande, Serang</div>
        </div>
        <div className="location-grid">
          <div className="location-card">
            <h3>Alamat</h3>
            <p>Jl. Cikande Permai No.11-12 Blok L9 Komp, Situterate, Kec. Cikande, Kabupaten Serang, Banten 42186</p>
            <p>Koordinat: -6.2216339332113595, 106.34573045889455</p>
            <p>Telp: +62 896-4385-2920</p>
          </div>
          <div className="location-card highlight">
            <h3>Pengiriman dan Pembayaran</h3>
            <p>GoSend, GrabExpress, kurir lokal, dan layanan eksternal. Midtrans menerima transfer, e-wallet, kartu.</p>
            <div className="hero-tags">
              <span>GoSend</span>
              <span>GrabExpress</span>
              <span>Kurir lokal</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div>
          <strong>Petshop Bento</strong>
          <p>Cat care dengan rasa hangat dan percaya diri.</p>
        </div>
        <div>
          <p>WhatsApp: +62 896-4385-2920</p>
          <p>Cikande, Serang</p>
        </div>
      </footer>
    </div>
  )
}

const demoProducts = [
  { name: 'Whiskas Adult 1.2kg', description: 'Rasa tuna, kaya nutrisi', price: 68000, stock: 25, category: 'Makanan' },
  { name: 'Vitamin Bulu Halus', description: 'Vitamin kulit dan bulu kucing', price: 42000, stock: 30, category: 'Vitamin' },
  { name: 'Pasir Kucing 10L', description: 'Aroma lembut, daya serap tinggi', price: 55000, stock: 18, category: 'Pasir' }
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

const promoTiles = [
  { title: 'Voucher Welcome', desc: 'Diskon member baru langsung aktif.' },
  { title: 'Cashback Instan', desc: 'Saldo otomatis masuk ke wallet.' },
  { title: 'Delivery Fleksibel', desc: 'Zone, per km, atau eksternal.' },
  { title: 'Dokter Berjadwal', desc: 'Booking tanpa antri.' }
]

const valueProps = [
  { title: 'Produk Terkurasi', desc: 'Stok aman, kualitas terjaga.' },
  { title: 'Layanan Lengkap', desc: 'Grooming, penitipan, vaksin.' },
  { title: 'Member Friendly', desc: 'Diskon, cashback, voucher.' },
  { title: 'Pembayaran Aman', desc: 'Midtrans siap semua metode.' }
]
