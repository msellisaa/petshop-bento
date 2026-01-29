import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'

const CORE_API = import.meta.env.VITE_CORE_API || 'http://localhost:8081'
const BOOKING_API = import.meta.env.VITE_BOOKING_API || 'http://localhost:8082'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''
const RECO_API = import.meta.env.VITE_RECO_API || 'http://localhost:8090'

const rupiah = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(n || 0)
const INDONESIA_TIMEZONES = {
  'Asia/Jakarta': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT'
}
const resolveIndonesiaTimeZone = () => {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  return INDONESIA_TIMEZONES[detected] ? detected : 'Asia/Jakarta'
}
const formatIndonesiaTime = (date, timeZone) => (
  new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone
  }).format(date)
)
const getZonedNow = (timeZone) => new Date(new Date().toLocaleString('en-US', { timeZone }))
const getFlashSaleEnd = (timeZone) => {
  const now = getZonedNow(timeZone)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  if (end <= now) {
    end.setDate(end.getDate() + 1)
  }
  return end
}

const buildGeoProxyURL = (lat, lng) => (
  `${CORE_API}/geo/reverse?lat=${lat}&lng=${lng}`
)

const isUUID = (value) => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')
)

const normalizeOrderId = (value) => (value || '').trim().toLowerCase()
const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    return `${hours}j ${mins % 60}m`
  }
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

const buildTrackingUrl = (base, orderId, token, stream = false) => {
  if (!orderId) return ''
  const path = stream ? `/delivery/track/${orderId}/stream` : `/delivery/track/${orderId}`
  const url = new URL(path, base)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

const getSessionId = () => {
  if (typeof window === 'undefined') return ''
  const existing = localStorage.getItem('session_id')
  if (existing) return existing
  const next = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  localStorage.setItem('session_id', next)
  return next
}

export default function App() {
  const [viewMode] = useState(() => {
    if (typeof window === 'undefined') return 'app'
    const params = new URLSearchParams(window.location.search)
    return params.get('driver') === '1' ? 'driver' : 'app'
  })
  const [trackingOrderId, setTrackingOrderId] = useState(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('track') || ''
  })
  const [trackingToken, setTrackingToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('token') || ''
  })
  const [products, setProducts] = useState([])
  const [schedules, setSchedules] = useState([])
  const [zones, setZones] = useState([])
  const [sessionId, setSessionId] = useState('')
  const [recommendations, setRecommendations] = useState([])
  const [cartId, setCartId] = useState(localStorage.getItem('cart_id') || '')
  const [cartItems, setCartItems] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [productCategory, setProductCategory] = useState('all')
  const [productSort, setProductSort] = useState('latest')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('auth_token') || '')
  const [user, setUser] = useState(null)
  const [myVouchers, setMyVouchers] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [myAppointments, setMyAppointments] = useState([])
  const [myServices, setMyServices] = useState([])
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ name: '', username: '', email: '', phone: '', password: '', avatar_url: '' })
  const [registerMethod, setRegisterMethod] = useState('email')
  const [avatarStatus, setAvatarStatus] = useState('')
  const [otpState, setOtpState] = useState({ code: '', token: '', message: '', sent: false, verified: false })
  const [googlePhone, setGooglePhone] = useState('')
  const [googleStatus, setGoogleStatus] = useState('')
  const [googleConsent, setGoogleConsent] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', username: '', avatar_url: '' })
  const [profileStatus, setProfileStatus] = useState('')
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' })
  const [passwordStatus, setPasswordStatus] = useState('')
  const [checkout, setCheckout] = useState({ name: '', phone: '', address: '', voucher_code: '', wallet_use: 0 })
  const [checkoutStatus, setCheckoutStatus] = useState('')
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
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselPaused, setCarouselPaused] = useState(false)
  const [timeZone, setTimeZone] = useState('Asia/Jakarta')
  const [zoneLabel, setZoneLabel] = useState('WIB')
  const [nowText, setNowText] = useState('')
  const [flashCountdown, setFlashCountdown] = useState('00:00:00')
  const [geoStatus, setGeoStatus] = useState('')
  const [geoCoords, setGeoCoords] = useState({ lat: '', lng: '' })
  const [geoAddress, setGeoAddress] = useState('')
  const [geoLocality, setGeoLocality] = useState('')
  const [trackingInfo, setTrackingInfo] = useState(null)
  const [trackingTrail, setTrackingTrail] = useState([])
  const [trackingStatus, setTrackingStatus] = useState('')
  const [trackingError, setTrackingError] = useState('')
  const [trackingQrData, setTrackingQrData] = useState('')
  const [autoCopyPulse, setAutoCopyPulse] = useState(false)
  const [toasts, setToasts] = useState([])
  const [showQrOverlay, setShowQrOverlay] = useState(false)
  const [trackingAge, setTrackingAge] = useState('')
  const [muteBeep, setMuteBeep] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem('mute_beep')
    return stored ? stored === 'true' : true
  })
  const [driverMode, setDriverMode] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('driver_mode')
    return stored ? stored === 'true' : false
  })
  const [driverToken, setDriverToken] = useState('')
  const [driverStatus, setDriverStatus] = useState('')
  const [driverLive, setDriverLive] = useState(false)
  const [driverForm, setDriverForm] = useState({
    order_id: '',
    driver_id: '',
    status: 'ON_ROUTE',
    lat: '',
    lng: '',
    speed_kph: '',
    heading: ''
  })
  const [shareStatus, setShareStatus] = useState('')
  const trackInputRef = useRef(null)
  const viewedProductsRef = useRef(new Set())
  const carouselRef = useRef(null)
  const touchStart = useRef(null)
  const driverWatchId = useRef(null)
  const driverLastSent = useRef(0)

  useEffect(() => {
    fetch(`${CORE_API}/products`).then(r => r.json()).then(setProducts).catch(() => setProducts([]))
    fetch(`${BOOKING_API}/schedules`).then(r => r.json()).then(setSchedules).catch(() => setSchedules([]))
    fetch(`${CORE_API}/delivery/zones`).then(r => r.json()).then(setZones).catch(() => setZones([]))
  }, [])

  useEffect(() => {
    setSessionId(getSessionId())
  }, [])

  useEffect(() => {
    const tz = resolveIndonesiaTimeZone()
    setTimeZone(tz)
    setZoneLabel(INDONESIA_TIMEZONES[tz] || 'WIB')
  }, [])

  useEffect(() => {
    if (!timeZone) return
    const tick = () => {
      setNowText(`${formatIndonesiaTime(new Date(), timeZone)} ${INDONESIA_TIMEZONES[timeZone] || 'WIB'}`)
    }
    tick()
    const id = setInterval(tick, 60 * 1000)
    return () => clearInterval(id)
  }, [timeZone])

  useEffect(() => {
    if (!timeZone) return
    const end = getFlashSaleEnd(timeZone)
    const tick = () => {
      const now = getZonedNow(timeZone)
      const diff = Math.max(0, end.getTime() - now.getTime())
      const hours = String(Math.floor(diff / 3600000)).padStart(2, '0')
      const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0')
      const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
      setFlashCountdown(`${hours}:${minutes}:${seconds}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [timeZone])

  useEffect(() => {
    if (!promoSlides.length || carouselPaused) return
    const id = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % promoSlides.length)
    }, 4500)
    return () => clearInterval(id)
  }, [carouselPaused])

  const handleCarouselSwipe = (direction) => {
    if (direction === 'left') {
      setCarouselIndex((prev) => (prev + 1) % promoSlides.length)
    } else if (direction === 'right') {
      setCarouselIndex((prev) => (prev - 1 + promoSlides.length) % promoSlides.length)
    }
  }

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0]
    if (!touch) return
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event) => {
    const touch = event.changedTouches?.[0]
    if (!touch || !touchStart.current) return
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      handleCarouselSwipe(dx < 0 ? 'left' : 'right')
    }
    touchStart.current = null
  }

  const reverseGeocode = async (lat, lng) => {
    try {
      const resp = await fetch(buildGeoProxyURL(lat, lng))
      const data = await resp.json()
      if (data.error) return { address: '', locality: '' }
      return {
        address: data.address || '',
        locality: data.locality || ''
      }
    } catch (err) {
      return { address: '', locality: '' }
    }
  }

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Perangkat tidak mendukung geolocation.')
      return
    }
    setGeoStatus('Mengambil lokasi...')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(6)
        const lng = pos.coords.longitude.toFixed(6)
        setGeoCoords({ lat, lng })
        setDeliveryInput((prev) => ({ ...prev, lat, lng }))
        const resolved = await reverseGeocode(lat, lng)
        if (resolved.address) {
          setGeoAddress(resolved.address)
        }
        if (resolved.locality) {
          setGeoLocality(resolved.locality)
        }
        if (!checkout.address && resolved.address) {
          setCheckout((prev) => ({ ...prev, address: resolved.address }))
        }
        setGeoStatus(resolved.address ? 'Lokasi berhasil diambil.' : 'Lokasi berhasil diambil (tanpa alamat).')
      },
      (err) => {
        const message = err.code === 1 ? 'Izin lokasi ditolak.' : 'Lokasi tidak tersedia.'
        setGeoStatus(message)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const sendDriverUpdate = async (payload) => {
    try {
      if (!payload.order_id || !isUUID(payload.order_id)) {
        setDriverStatus('Order ID tidak valid.')
        return false
      }
      setDriverStatus('Mengirim lokasi...')
      const resp = await fetch(`${CORE_API}/delivery/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(driverToken ? { 'X-Driver-Token': driverToken } : {})
        },
        body: JSON.stringify(payload)
      })
      const data = await resp.json()
      if (data.error) {
        setDriverStatus(data.error)
        return false
      }
      setDriverStatus('Update lokasi terkirim.')
      return true
    } catch (err) {
      setDriverStatus('Gagal mengirim lokasi.')
      return false
    }
  }

  const handleDriverUseLocation = () => {
    if (!navigator.geolocation) {
      setDriverStatus('Perangkat tidak mendukung geolocation.')
      return
    }
    setDriverStatus('Mengambil lokasi driver...')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6)
        const lng = pos.coords.longitude.toFixed(6)
        setDriverForm((prev) => ({ ...prev, lat, lng }))
        setDriverStatus('Lokasi driver siap.')
      },
      () => setDriverStatus('Lokasi driver tidak tersedia.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const startDriverLive = () => {
    if (!navigator.geolocation) {
      setDriverStatus('Perangkat tidak mendukung geolocation.')
      return
    }
    if (!driverForm.order_id) {
      setDriverStatus('Order ID wajib diisi.')
      return
    }
    setDriverLive(true)
    driverLastSent.current = 0
    driverWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - driverLastSent.current < 4000) return
        driverLastSent.current = now
        const payload = {
          order_id: driverForm.order_id,
          driver_id: driverForm.driver_id || 'DRV-LOCAL',
          status: driverForm.status || 'ON_ROUTE',
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          speed_kph: Number(((pos.coords.speed || 0) * 3.6).toFixed(1)),
          heading: Number(pos.coords.heading || 0)
        }
        sendDriverUpdate(payload)
      },
      () => {
        setDriverStatus('Live tracking gagal.')
        setDriverLive(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    )
  }

  const stopDriverLive = () => {
    if (driverWatchId.current) {
      navigator.geolocation.clearWatch(driverWatchId.current)
      driverWatchId.current = null
    }
    setDriverLive(false)
    setDriverStatus('Live tracking berhenti.')
  }

  const handleCopyTrackingLink = async () => {
    if (!trackingShareUrl) return
    try {
      await navigator.clipboard.writeText(trackingShareUrl)
      setShareStatus('Link tracking disalin.')
      setAutoCopyPulse(true)
      showToast('Link tracking disalin', 'success')
      if (navigator.vibrate) navigator.vibrate(40)
      if (!muteBeep && (window.AudioContext || window.webkitAudioContext)) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.value = 0.03
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.08)
      }
      setTimeout(() => setAutoCopyPulse(false), 1200)
    } catch (err) {
      setShareStatus('Gagal menyalin link.')
      showToast('Gagal menyalin link', 'error')
    }
  }

  const handleTrackLookup = () => {
    const trimmed = normalizeOrderId(trackingOrderId)
    if (!trimmed) {
      setTrackingError('Order ID wajib diisi.')
      return
    }
    if (!isUUID(trimmed)) {
      setTrackingError('Format Order ID tidak valid.')
      return
    }
    setTrackingOrderId(trimmed)
    setTrackingError('')
    setTimeout(() => {
      const el = document.getElementById('tracking')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }

  useEffect(() => {
    if (orderInfo?.order_id) {
      setDriverForm((prev) => ({ ...prev, order_id: orderInfo.order_id }))
    }
  }, [orderInfo])

  useEffect(() => {
    if (trackingOrderId) {
      setDriverForm((prev) => ({ ...prev, order_id: trackingOrderId }))
    }
  }, [trackingOrderId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (trackingOrderId && trackInputRef.current) {
      trackInputRef.current.focus()
      trackInputRef.current.select()
    }
  }, [trackingOrderId])

  useEffect(() => {
    if (viewMode === 'driver') {
      const normalized = normalizeOrderId(driverForm.order_id)
      if (normalized !== trackingOrderId) {
        setTrackingOrderId(normalized)
      }
    }
  }, [driverForm.order_id, trackingOrderId, viewMode])

  useEffect(() => {
    if (!trackingShareUrl) {
      setTrackingQrData('')
      return
    }
    let active = true
    QRCode.toDataURL(trackingShareUrl, { width: 180, margin: 1 })
      .then((dataUrl) => {
        if (active) setTrackingQrData(dataUrl)
      })
      .catch(() => {
        if (active) setTrackingQrData('')
      })
    return () => {
      active = false
    }
  }, [trackingShareUrl])



  useEffect(() => {
    if (!trackingInfo?.created_at) {
      setTrackingAge('')
      return
    }
    const tick = () => {
      const diff = Date.now() - new Date(trackingInfo.created_at).getTime()
      setTrackingAge(formatElapsed(diff))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [trackingInfo])

  useEffect(() => {
    return () => {
      if (driverWatchId.current) {
        navigator.geolocation.clearWatch(driverWatchId.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!cartId) return
    fetch(`${CORE_API}/cart?cart_id=${cartId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCartItems(data.map(i => ({
            id: i.id,
            product_id: i.product_id,
            name: i.product_name,
            price: i.price,
            qty: i.qty
          })))
        }
      })
      .catch(() => {})
  }, [cartId])

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

  const trackEvent = (eventType, productId, metadata = {}) => {
    if (!sessionId && !token) return
    fetch(`${CORE_API}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Auth-Token': token } : {}),
        ...(sessionId ? { 'X-Session-Id': sessionId } : {})
      },
      body: JSON.stringify({
        session_id: sessionId,
        event_type: eventType,
        product_id: productId,
        metadata
      })
    }).catch(() => {})
  }

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (user?.id) params.set('user_id', user.id)
    if (sessionId) params.set('session_id', sessionId)
    params.set('limit', '6')
    fetch(`${RECO_API}/recommendations?${params.toString()}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.items)) setRecommendations(data.items)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [user?.id, sessionId])

  useEffect(() => {
    if (!user) return
    setProfileForm({
      name: user.name || '',
      username: user.username || '',
      avatar_url: user.avatar_url || ''
    })
    if (user.phone && token) {
      fetch(`${CORE_API}/me/appointments`, { headers: { 'X-Auth-Token': token } })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setMyAppointments(data) })
        .catch(() => setMyAppointments([]))
      fetch(`${CORE_API}/me/service-bookings`, { headers: { 'X-Auth-Token': token } })
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setMyServices(data) })
        .catch(() => setMyServices([]))
    }
  }, [user, token])

  const subtotal = useMemo(() => cartItems.reduce((acc, item) => acc + item.price * item.qty, 0), [cartItems])
  const canCheckout = useMemo(() => {
    if (!cartId) return false
    if (!checkout.name || !checkout.phone || !checkout.address) return false
    if (!quoteInfo) return false
    if (deliveryType === 'zone') return !!deliveryInput.zone_id
    if (deliveryType === 'per_km') {
      const hasDistance = Number(deliveryInput.distance_km || 0) > 0
      const hasCoords = Number(deliveryInput.lat || 0) !== 0 && Number(deliveryInput.lng || 0) !== 0
      return hasDistance || hasCoords
    }
    if (deliveryType === 'external') return true
    return false
  }, [
    cartId,
    checkout.name,
    checkout.phone,
    checkout.address,
    quoteInfo,
    deliveryType,
    deliveryInput.zone_id,
    deliveryInput.lat,
    deliveryInput.lng,
    deliveryInput.distance_km
  ])
  const categories = useMemo(() => {
    const all = new Set(products.map(p => p.category).filter(Boolean))
    return ['all', ...Array.from(all)]
  }, [products])
  const filteredProducts = useMemo(() => {
    const base = products.length ? products : demoProducts
    const query = productQuery.trim().toLowerCase()
    let list = base.filter(p => {
      const inCategory = productCategory === 'all' || p.category === productCategory
      const inQuery = !query || (p.name || '').toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query)
      return inCategory && inQuery
    })
    if (productSort === 'price_low') {
      list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0))
    } else if (productSort === 'price_high') {
      list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0))
    }
    return list
  }, [products, productQuery, productCategory, productSort])

  const trackingMapUrl = useMemo(() => {
    if (!trackingInfo?.lat || !trackingInfo?.lng) return ''
    const center = `${trackingInfo.lat},${trackingInfo.lng}`
    if (GOOGLE_MAPS_KEY) {
      return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=15&size=640x320&markers=color:0xff6b6b|${center}&key=${GOOGLE_MAPS_KEY}`
    }
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${center}&zoom=15&size=640x320&markers=${center},red-pushpin`
  }, [trackingInfo])

  const trackingUpdatedText = useMemo(() => {
    if (!trackingInfo?.created_at) return ''
    return `${formatIndonesiaTime(new Date(trackingInfo.created_at), timeZone)} ${zoneLabel}`
  }, [trackingInfo, timeZone, zoneLabel])

  const activeTrackingOrderId = useMemo(() => (
    orderInfo?.order_id || trackingOrderId
  ), [orderInfo, trackingOrderId])

  const activeTrackingToken = useMemo(() => (
    orderInfo?.tracking_token || trackingToken
  ), [orderInfo, trackingToken])

  const trackingShareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !activeTrackingOrderId) return ''
    const url = new URL(window.location.href)
    url.searchParams.set('track', activeTrackingOrderId)
    if (activeTrackingToken) {
      url.searchParams.set('token', activeTrackingToken)
    } else {
      url.searchParams.delete('token')
    }
    url.hash = '#tracking'
    return url.toString()
  }, [activeTrackingOrderId, activeTrackingToken])

  const trackingWhatsappUrl = useMemo(() => {
    if (!trackingShareUrl) return ''
    const text = `Tracking pesanan kamu: ${trackingShareUrl}`
    return `https://wa.me/?text=${encodeURIComponent(text)}`
  }, [trackingShareUrl])

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
    if (nextCartId) {
      localStorage.setItem('cart_id', nextCartId)
    }
    setCartItems(prev => {
      const existing = prev.find(i => i.product_id === product.id)
      if (existing) {
        return prev.map(i => i.product_id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { product_id: product.id, name: product.name, price: product.price, qty: 1 }]
    })
    if (product?.id) {
      trackEvent('add_to_cart', product.id)
    }
  }

  const updateCartQty = async (productId, qty) => {
    if (!cartId) return
    const resp = await fetch(`${CORE_API}/cart/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: cartId, product_id: productId, qty })
    })
    if (resp.ok) {
      setCartItems(prev => prev.map(i => i.product_id === productId ? { ...i, qty } : i).filter(i => i.qty > 0))
    }
  }

  const removeCartItem = async (productId) => {
    if (!cartId) return
    const resp = await fetch(`${CORE_API}/cart/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: cartId, product_id: productId })
    })
    if (resp.ok) {
      setCartItems(prev => prev.filter(i => i.product_id !== productId))
      if (productId) {
        trackEvent('remove_cart', productId)
      }
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
      setOtpState({ ...otpState, message: 'Nomor WhatsApp wajib diisi sebelum OTP.' })
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

  const handleGoogleCredential = async (credential) => {
    setGoogleStatus('')
    if (!googleConsent) {
      setGoogleStatus('Setujui izin akses Google terlebih dulu.')
      return
    }
    const resp = await fetch(`${CORE_API}/auth/google/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: credential, phone: googlePhone })
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

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setGoogleStatus('Google Client ID belum diisi.')
      return
    }
    if (!googleConsent) return
    const renderButton = () => {
      const el = document.getElementById('google-signin')
      if (!el || !window.google?.accounts?.id) return
      el.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => handleGoogleCredential(resp.credential)
      })
      window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large' })
    }
    renderButton()
  }, [googleConsent])

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

  const changePassword = async (e) => {
    e.preventDefault()
    if (!token) return
    setPasswordStatus('')
    const resp = await fetch(`${CORE_API}/me/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify(passwordForm)
    })
    const data = await resp.json()
    if (data.error) {
      setPasswordStatus(data.error)
      return
    }
    setPasswordStatus('Password berhasil diubah.')
    setPasswordForm({ current_password: '', new_password: '' })
  }

  const submitOrder = async (e) => {
    e.preventDefault()
    setCheckoutStatus('')
    if (!cartId) {
      setCheckoutStatus('Keranjang kosong.')
      return
    }
    if (!checkout.name || !checkout.phone || !checkout.address) {
      setCheckoutStatus('Nama, telepon, dan alamat wajib diisi.')
      return
    }
    if (!quoteInfo) {
      setCheckoutStatus('Hitung ongkir dulu sebelum checkout.')
      return
    }
    if (deliveryType === 'zone' && !deliveryInput.zone_id) {
      setCheckoutStatus('Pilih zona pengiriman.')
      return
    }
    if (deliveryType === 'per_km') {
      const hasDistance = Number(deliveryInput.distance_km || 0) > 0
      const hasCoords = Number(deliveryInput.lat || 0) !== 0 && Number(deliveryInput.lng || 0) !== 0
      if (!hasDistance && !hasCoords) {
        setCheckoutStatus('Isi jarak atau koordinat untuk ongkir per KM.')
        return
      }
    }
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
        delivery_type: deliveryType,
        zone_id: deliveryInput.zone_id,
        lat: Number(deliveryInput.lat || 0),
        lng: Number(deliveryInput.lng || 0),
        distance_km: Number(deliveryInput.distance_km || 0),
        voucher_code: checkout.voucher_code,
        wallet_use: Number(checkout.wallet_use || 0)
      })
    })
    const data = await resp.json()
    if (data.error) {
      setCheckoutStatus(data.error)
      return
    }
    if (!data.error) {
      setOrderInfo(data)
      setTrackingInfo(null)
      setTrackingTrail([])
      setTrackingStatus('Menyiapkan tracking...')
      setSnapUrl('')
      setPaymentStatus(null)
      setCartItems([])
      setCartId('')
      localStorage.removeItem('cart_id')
      setTrackingOrderId(data.order_id)
      setTrackingToken(data.tracking_token || '')
      setShareStatus('')
      trackEvent('checkout', null, { order_id: data.order_id, total: data.total })
      if (token) {
        const me = await fetch(`${CORE_API}/me`, { headers: { 'X-Auth-Token': token } }).then(r => r.json())
        if (!me.error) setUser(me)
        const orders = await fetch(`${CORE_API}/me/orders`, { headers: { 'X-Auth-Token': token } }).then(r => r.json())
        if (Array.isArray(orders)) setMyOrders(orders)
      }
      setCheckoutStatus('Order berhasil dibuat.')
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data.order_id).then(() => {
          showToast('Order ID disalin', 'success')
        }).catch(() => {})
      }
      setTimeout(() => {
        let shareUrl = ''
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.set('track', data.order_id)
          if (data.tracking_token) {
            url.searchParams.set('token', data.tracking_token)
          } else {
            url.searchParams.delete('token')
          }
          url.hash = '#tracking'
          shareUrl = url.toString()
        }
        if (shareUrl && navigator.clipboard) {
          navigator.clipboard.writeText(shareUrl).then(() => {
            setShareStatus('Link tracking otomatis disalin.')
            setAutoCopyPulse(true)
            setTimeout(() => setAutoCopyPulse(false), 1200)
            showToast('Link tracking otomatis disalin', 'success')
            if (navigator.vibrate) navigator.vibrate(40)
          }).catch(() => {})
        }
      }, 400)
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

  const handleProductOpen = (product) => {
    setSelectedProduct(product)
    if (product?.id && !viewedProductsRef.current.has(product.id)) {
      viewedProductsRef.current.add(product.id)
      trackEvent('view_product', product.id)
    }
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

  useEffect(() => {
    if (!activeTrackingOrderId) return
    if (!isUUID(activeTrackingOrderId)) {
      setTrackingError('Format Order ID tidak valid.')
      setTrackingStatus('')
      return
    }
    setTrackingError('')
    let active = true
    let sse
    const streamUrl = buildTrackingUrl(CORE_API, activeTrackingOrderId, activeTrackingToken, true)
    const fallbackPoll = async () => {
      try {
        const resp = await fetch(buildTrackingUrl(CORE_API, activeTrackingOrderId, activeTrackingToken))
        if (!resp.ok) {
          if (active) setTrackingStatus('Tracking belum tersedia.')
          return
        }
        const data = await resp.json()
        if (!active) return
        setTrackingInfo(data.latest || null)
        setTrackingTrail(data.trail || [])
        setTrackingStatus(data.latest ? 'Tracking aktif.' : 'Menunggu update driver.')
      } catch (err) {
        if (active) setTrackingStatus('Tracking gagal dimuat.')
      }
    }

    if (window.EventSource) {
      setTrackingStatus('Realtime via stream...')
      sse = new EventSource(streamUrl)
      sse.addEventListener('tracking', (event) => {
        if (!active) return
        const payload = JSON.parse(event.data)
        setTrackingInfo(payload)
        setTrackingTrail((prev) => [payload, ...prev].slice(0, 6))
        setTrackingStatus('Tracking realtime aktif.')
      })
      sse.onerror = () => {
        if (!active) return
        setTrackingStatus('Stream terputus, fallback polling.')
        sse?.close()
        sse = null
        fallbackPoll()
      }
    } else {
      fallbackPoll()
    }

    let id
    if (!window.EventSource) {
      id = setInterval(fallbackPoll, 5000)
    }
    return () => {
      active = false
      if (sse) sse.close()
      if (id) clearInterval(id)
    }
  }, [activeTrackingOrderId])

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

  const driverPanel = (
    <div className="tracking-card">
      <div className="driver-grid">
        <input placeholder="Order ID" value={driverForm.order_id} onChange={(e) => setDriverForm({ ...driverForm, order_id: normalizeOrderId(e.target.value) })} />
        <input placeholder="Tracking Token (opsional)" value={trackingToken} onChange={(e) => setTrackingToken(e.target.value.trim())} />
        <input placeholder="Driver ID" value={driverForm.driver_id} onChange={(e) => setDriverForm({ ...driverForm, driver_id: e.target.value })} />
        <select value={driverForm.status} onChange={(e) => setDriverForm({ ...driverForm, status: e.target.value })}>
          <option value="ON_ROUTE">On route</option>
          <option value="PICKED_UP">Picked up</option>
          <option value="ARRIVED">Arrived</option>
          <option value="DELIVERED">Delivered</option>
        </select>
        <input placeholder="Driver Token (opsional)" value={driverToken} onChange={(e) => setDriverToken(e.target.value)} />
        <input placeholder="Latitude" value={driverForm.lat} onChange={(e) => setDriverForm({ ...driverForm, lat: e.target.value })} />
        <input placeholder="Longitude" value={driverForm.lng} onChange={(e) => setDriverForm({ ...driverForm, lng: e.target.value })} />
        <input placeholder="Speed (km/j)" value={driverForm.speed_kph} onChange={(e) => setDriverForm({ ...driverForm, speed_kph: e.target.value })} />
        <input placeholder="Heading" value={driverForm.heading} onChange={(e) => setDriverForm({ ...driverForm, heading: e.target.value })} />
      </div>
      <div className="row">
        <button className="btn ghost" type="button" onClick={handleDriverUseLocation}>Gunakan lokasi driver</button>
        <button
          className="btn outline"
          type="button"
          onClick={() => sendDriverUpdate({
            order_id: driverForm.order_id,
            driver_id: driverForm.driver_id || 'DRV-LOCAL',
            status: driverForm.status || 'ON_ROUTE',
            lat: Number(driverForm.lat || 0),
            lng: Number(driverForm.lng || 0),
            speed_kph: Number(driverForm.speed_kph || 0),
            heading: Number(driverForm.heading || 0)
          })}
        >
          Kirim Update
        </button>
        <button className="btn primary" type="button" onClick={driverLive ? stopDriverLive : startDriverLive}>
          {driverLive ? 'Stop Live' : 'Live Tracking'}
        </button>
      </div>
      {driverStatus && <small>{driverStatus}</small>}
    </div>
  )

  if (viewMode === 'driver') {
    return (
      <div className="driver-page">
        <header className="driver-header">
          <div>
            <strong>Driver Mode</strong>
            <p>Update lokasi pengiriman secara realtime.</p>
          </div>
          <a className="btn outline" href="/">Kembali ke app</a>
        </header>
        <section className="driver-content">
          {driverPanel}
          {trackingShareUrl && (
            <div className="tracking-card">
              <strong>Bagikan tracking</strong>
              <div className={`tracking-share ${autoCopyPulse ? 'pulse' : ''}`}>
                <input readOnly value={trackingShareUrl} />
                <div className="row">
                  <button className="btn outline" type="button" onClick={handleCopyTrackingLink}>Copy link</button>
                  <a className="btn ghost" href={trackingShareUrl} target="_blank" rel="noreferrer">Buka</a>
                  {trackingWhatsappUrl && (
                    <a className="btn ghost" href={trackingWhatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>
                  )}
                  <label className="mute-toggle">
                    <input
                      type="checkbox"
                      checked={muteBeep}
                      onChange={(e) => setMuteBeep(e.target.checked)}
                    />
                    <span>Mute beep</span>
                  </label>
                </div>
                {trackingQrData && (
                  <img className="tracking-qr" src={trackingQrData} alt="QR tracking" />
                )}
                {shareStatus && <small>{shareStatus}</small>}
              </div>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">Petshop Bento</div>
          <div className="appbar-meta">
            <div className="meta-chip">
              <span className="status-dot" aria-hidden="true" />
              <div>
                <small>Lokasi</small>
                <strong>Indonesia • {geoLocality || 'Lokasi Anda'} • {zoneLabel}</strong>
              </div>
            </div>
            <div className="meta-chip">
              <small>Waktu lokal</small>
              <strong>{nowText || 'Memuat waktu...'}</strong>
            </div>
          </div>
        </div>
        <nav className="topnav">
          <a href="#home">Home</a>
          <a href="#quick">Menu Utama</a>
          <a href="#feed">Feed</a>
          <a href="#layanan">Layanan</a>
          <a href="#booking">Booking</a>
          <a href="#member">Profile</a>
        </nav>
        <div className="top-actions">
          <a className="pill" href="https://wa.me/6289643852920" target="_blank" rel="noreferrer">Chat WhatsApp</a>
          <button className="icon-btn" onClick={() => setCartOpen(true)} aria-label="Buka keranjang">
            <span className="icon">{ICONS.cart}</span>
            <span className="badge-count">{cartItems.length}</span>
          </button>
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
                    <div>
                      <strong>{item.name}</strong>
                      <div className="qty-row">
                        <button className="qty-btn" onClick={() => updateCartQty(item.product_id, item.qty - 1)}>-</button>
                        <span>{item.qty}</span>
                        <button className="qty-btn" onClick={() => updateCartQty(item.product_id, item.qty + 1)}>+</button>
                      </div>
                    </div>
                    <div className="cart-actions">
                      <span>{rupiah(item.price * item.qty)}</span>
                      <button className="btn mini" onClick={() => removeCartItem(item.product_id)}>Hapus</button>
                    </div>
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

      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedProduct(null)}>Tutup</button>
            {selectedProduct.image_url && (
              <img className="modal-img" src={`${CORE_API}${selectedProduct.image_url}`} alt={selectedProduct.name} />
            )}
            <h3>{selectedProduct.name}</h3>
            <p>{selectedProduct.description}</p>
            <div className="row">
              <span className="cat-pill">{selectedProduct.category || 'Kebutuhan Kucing'}</span>
              <span className="stock">Stok {selectedProduct.stock}</span>
            </div>
            <div className="price-row">
              <strong>{rupiah(selectedProduct.price)}</strong>
              <button className="btn primary" onClick={() => addToCart(selectedProduct)}>Tambah ke Keranjang</button>
            </div>
          </div>
        </div>
      )}

      <section id="home" className="hero">
        <div className="hero-left">
          <div className="hero-badges">
            <span className="badge accent">Super App Petcare</span>
            <span className="badge ghost">Bento Grid UI</span>
          </div>
          <h1>Belanja kebutuhan kucing, booking dokter, semua rapi dalam satu aplikasi.</h1>
          <p className="lead">
            Produk lengkap, layanan grooming dan penitipan, konsultasi gratis, plus pembayaran Midtrans.
            Interface dibuat mobile-first, thumb-friendly, dan content-rich.
          </p>
          <div className="cta-row">
            <a className="btn primary" href="#feed">Belanja Sekarang</a>
            <a className="btn outline" href="#booking">Booking Layanan</a>
          </div>
          <div className="flash-card">
            <div>
              <strong>Flash Sale Hari Ini</strong>
              <p>Potongan ekstra + cashback, berlaku sampai malam.</p>
            </div>
            <div className="countdown">
              <span>{flashCountdown}</span>
              <small>berakhir {zoneLabel}</small>
            </div>
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
          <div
            className="carousel-card"
            ref={carouselRef}
            onMouseEnter={() => setCarouselPaused(true)}
            onMouseLeave={() => setCarouselPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onFocus={() => setCarouselPaused(true)}
            onBlur={() => setCarouselPaused(false)}
            tabIndex={0}
          >
            <div className="carousel">
              {promoSlides.map((slide, idx) => (
                <div className={`slide ${idx === carouselIndex ? 'active' : ''}`} key={slide.title}>
                  <div className="slide-content">
                    <span className="pill tiny">{slide.badge}</span>
                    <h3>{slide.title}</h3>
                    <p>{slide.desc}</p>
                    <div className="slide-tags">
                      {slide.tags.map(tag => <span key={tag}>{tag}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="carousel-dots" role="tablist" aria-label="Promo carousel">
              {promoSlides.map((slide, idx) => (
                <button
                  key={slide.title}
                  className={`dot ${idx === carouselIndex ? 'active' : ''}`}
                  onClick={() => setCarouselIndex(idx)}
                  aria-label={`Promo ${idx + 1}`}
                />
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

      <section id="quick" className="quick-section">
        <div className="section-head">
          <div>
            <h2>Menu Utama</h2>
            <p>Akses cepat ke layanan, promo, dan kebutuhan harian.</p>
          </div>
          <div className="badge">Thumb-friendly</div>
        </div>
        <div className="quick-grid">
          {quickAccess.map((item) => (
            <a className="quick-item" href={item.href} key={item.label}>
              <div className="quick-icon">{item.icon}</div>
              <span>{item.label}</span>
              {item.badge ? <em>{item.badge}</em> : null}
            </a>
          ))}
        </div>
      </section>

      <section id="rekomendasi" className="section">
        <div className="section-head">
          <div>
            <h2>Rekomendasi Untukmu</h2>
            <p>Dipilih dari aktivitas belanja terbaru.</p>
          </div>
          <div className="badge">Personalized</div>
        </div>
        <div className="reco-grid">
          {(recommendations.length ? recommendations : demoProducts).slice(0, 6).map((p) => (
            <div className="product-card reco-card" key={p.id || p.name} onClick={() => handleProductOpen(p)}>
              {p.image_url && <img className="product-img" src={`${CORE_API}${p.image_url}`} alt={p.name} />}
              <div className="product-top">
                <span className="cat-pill">{p.category || 'Rekomendasi'}</span>
                <span className="stock">Stok {p.stock ?? '-'}</span>
              </div>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <div className="price-row">
                <strong>{rupiah(p.price)}</strong>
                <button className="btn mini" onClick={(e) => { e.stopPropagation(); addToCart(p) }}>Tambah</button>
              </div>
            </div>
          ))}
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

      <section id="feed" className="section">
        <div className="section-head">
          <div>
            <h2>Produk Favorit</h2>
            <p>Pilihan terbaik untuk makanan, vitamin, pasir, kandang, dan aksesori.</p>
          </div>
          <div className="cart-chip">
            Keranjang {cartItems.length} item - {rupiah(subtotal)}
          </div>
        </div>
        <div className="filter-row">
          <input placeholder="Cari produk..." value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
          <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'Semua Kategori' : c}</option>)}
          </select>
          <select value={productSort} onChange={(e) => setProductSort(e.target.value)}>
            <option value="latest">Terbaru</option>
            <option value="price_low">Harga Termurah</option>
            <option value="price_high">Harga Termahal</option>
          </select>
        </div>
        <div className="product-grid">
          {filteredProducts.map(p => (
            <div className="product-card" key={p.id || p.name} onClick={() => handleProductOpen(p)}>
              {p.image_url && <img className="product-img" src={`${CORE_API}${p.image_url}`} alt={p.name} />}
              <div className="product-top">
                <span className="cat-pill">{p.category || 'Kebutuhan Kucing'}</span>
                <span className="stock">Stok {p.stock}</span>
              </div>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <div className="price-row">
                <strong>{rupiah(p.price)}</strong>
                <button className="btn mini" onClick={(e) => { e.stopPropagation(); addToCart(p) }}>Tambah</button>
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
                  <div className="row">
                    <button type="button" className="btn ghost" onClick={handleUseLocation}>
                      Gunakan Lokasi Saya
                    </button>
                    <span className="geo-status">{geoStatus}</span>
                  </div>
                  {(geoAddress || (geoCoords.lat && geoCoords.lng)) && (
                    <div className="geo-preview">
                      <strong>Lokasi terdeteksi</strong>
                      {geoAddress && <p>{geoAddress}</p>}
                      <small>{geoCoords.lat}, {geoCoords.lng}</small>
                    </div>
                  )}
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
              <button className="btn primary" type="submit" disabled={!canCheckout}>Checkout</button>
              {checkoutStatus && <small>{checkoutStatus}</small>}
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
                {snapUrl && (
                  <div className="pay-row">
                    <a className="btn primary" href={snapUrl} target="_blank" rel="noreferrer">Buka Pembayaran</a>
                    <small>Link Midtrans siap dibuka di tab baru.</small>
                  </div>
                )}
                {paymentStatus && <p>Status pembayaran: {paymentStatus.transaction_status || paymentStatus.status_message || 'unknown'}</p>}
                {trackingShareUrl && (
                  <div className={`tracking-share compact ${autoCopyPulse ? 'pulse' : ''}`}>
                    <input readOnly value={trackingShareUrl} />
                    <div className="row">
                      <button className="btn outline" type="button" onClick={handleCopyTrackingLink}>Copy link</button>
                      <a className="btn ghost" href={trackingShareUrl} target="_blank" rel="noreferrer">Buka</a>
                      {trackingWhatsappUrl && (
                        <a className="btn ghost" href={trackingWhatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>
                      )}
                      <label className="mute-toggle">
                        <input
                          type="checkbox"
                          checked={muteBeep}
                          onChange={(e) => setMuteBeep(e.target.checked)}
                        />
                        <span>Mute beep</span>
                      </label>
                    </div>
                    {trackingQrData && (
                      <img className="tracking-qr" src={trackingQrData} alt="QR tracking" />
                    )}
                    {shareStatus && <small>{shareStatus}</small>}
                  </div>
                )}
              </div>
            ) : (
              <p>Belum ada order.</p>
            )}
          </div>
        </div>
      </section>

      <section id="track-input" className="section">
        <div className="section-head">
          <div>
            <h2>Lacak Pesanan</h2>
            <p>Masukkan Order ID untuk melihat posisi kurir.</p>
          </div>
          <div className="badge">Tracking live</div>
        </div>
        <div className="tracking-card">
          <div className="row">
            <input
              ref={trackInputRef}
              placeholder="Order ID (UUID)"
              value={trackingOrderId}
              onChange={(e) => {
                const value = normalizeOrderId(e.target.value)
                setTrackingOrderId(value)
                if (!value) {
                  setTrackingError('')
                } else if (!isUUID(value)) {
                  setTrackingError('Format Order ID tidak valid.')
                } else {
                  setTrackingError('')
                }
              }}
            />
            <button className="btn outline" type="button" onClick={handleTrackLookup}>Lacak</button>
          </div>
          <div className="row">
            <input
              placeholder="Tracking Token (opsional)"
              value={trackingToken}
              onChange={(e) => setTrackingToken(e.target.value.trim())}
            />
          </div>
          <div className="tracking-hint">
            <small className={`hint ${trackingError ? 'error' : trackingOrderId ? 'ok' : ''}`}>
              {trackingError
                ? trackingError
                : trackingOrderId
                  ? 'Order ID valid, siap dilacak.'
                  : 'Format UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
            </small>
            {trackingOrderId && (
              <button
                className="btn ghost mini"
                type="button"
                onClick={() => {
                  if (!trackingOrderId) return
                  navigator.clipboard.writeText(trackingOrderId).then(() => {
                    showToast('Order ID disalin', 'success')
                  }).catch(() => {
                    showToast('Gagal menyalin Order ID', 'error')
                  })
                }}
              >
                Salin Order ID
              </button>
            )}
          </div>
        </div>
      </section>

      {showQrOverlay && trackingQrData && (
        <div className="modal-overlay" onClick={() => setShowQrOverlay(false)}>
          <div className="modal qr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowQrOverlay(false)}>Tutup</button>
            <img className="tracking-qr xl" src={trackingQrData} alt="QR tracking fullscreen" />
            <small>Scan QR untuk buka tracking.</small>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              className={`toast ${toast.type}`}
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            >
              {toast.message}
            </button>
          ))}
        </div>
      )}

      {activeTrackingOrderId && (
        <section id="tracking" className="section alt">
          <div className="section-head">
            <div>
              <h2>Tracking Pengiriman</h2>
              <p>Update lokasi driver real-time untuk kurir internal.</p>
            </div>
            <div className={`badge ${trackingStatus.includes('Stream') || trackingStatus.includes('realtime') ? 'live' : 'offline'}`}>
              {trackingError || trackingStatus || 'Menyiapkan tracking'}
            </div>
          </div>
          <div className="tracking-grid">
            <div className="tracking-card">
              <div className="tracking-row">
                <div>
                  <strong>Status</strong>
                  <p>{trackingInfo?.status || 'Menunggu driver'}</p>
                </div>
                <div>
                  <strong>Update terakhir</strong>
                  <p>{trackingUpdatedText || 'Belum ada update'} {trackingAge ? `(${trackingAge} lalu)` : ''}</p>
                </div>
              </div>
              <div className="tracking-row">
                <div>
                  <strong>Koordinat</strong>
                  <p>{trackingInfo ? `${trackingInfo.lat}, ${trackingInfo.lng}` : 'Belum tersedia'}</p>
                </div>
                <div>
                  <strong>Kecepatan</strong>
                  <p>{trackingInfo && trackingInfo.speed_kph !== undefined ? `${trackingInfo.speed_kph} km/j` : '-'}</p>
                </div>
              </div>
              {trackingInfo?.driver_id && (
                <div className="tracking-driver">
                  <span className="tag">Driver</span>
                  <strong>{trackingInfo.driver_id}</strong>
                </div>
              )}
              {trackingTrail.length > 0 && (
                <div className="tracking-trail">
                  <strong>Jejak terakhir</strong>
                  <ul>
                    {trackingTrail.slice(0, 4).map((t) => (
                      <li key={t.id || `${t.lat}-${t.lng}-${t.created_at}`}>
                        {t.lat}, {t.lng} - {formatIndonesiaTime(new Date(t.created_at), timeZone)} {zoneLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="tracking-card map">
              {trackingMapUrl ? (
                <img src={trackingMapUrl} alt="Peta lokasi driver" />
              ) : (
                <div className="map-placeholder">
                  <strong>Peta tracking</strong>
                  <p>Masukkan API key Google Maps untuk tampilan peta detail.</p>
                </div>
              )}
            </div>
          </div>
          {trackingShareUrl && (
            <div className={`tracking-share ${autoCopyPulse ? 'pulse' : ''}`}>
              <input readOnly value={trackingShareUrl} />
              <div className="row">
                <button className="btn outline" type="button" onClick={handleCopyTrackingLink}>Copy link</button>
                <a className="btn ghost" href={trackingShareUrl} target="_blank" rel="noreferrer">Buka</a>
                {trackingWhatsappUrl && (
                  <a className="btn ghost" href={trackingWhatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>
                )}
                <label className="mute-toggle">
                  <input
                    type="checkbox"
                    checked={muteBeep}
                    onChange={(e) => setMuteBeep(e.target.checked)}
                  />
                  <span>Mute beep</span>
                </label>
              </div>
              {trackingQrData && (
                <img className="tracking-qr" src={trackingQrData} alt="QR tracking" />
              )}
              {shareStatus && <small>{shareStatus}</small>}
            </div>
          )}
          {trackingQrData && (
            <div className="tracking-card qr">
              <strong>QR Tracking</strong>
              <img className="tracking-qr large" src={trackingQrData} alt="QR tracking besar" />
              <div className="row">
                <button className="btn outline" type="button" onClick={() => setShowQrOverlay(true)}>Scan fullscreen</button>
                <small>Scan untuk membuka halaman tracking.</small>
              </div>
            </div>
          )}
          <div className="tracking-driver-panel">
            <div className="driver-toggle">
              <div>
                <strong>Driver Mode</strong>
                <p>Untuk kurir internal mengirim lokasi ke sistem.</p>
              </div>
              <button className="btn outline" type="button" onClick={() => setDriverMode(!driverMode)}>
                {driverMode ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            {driverMode && (
              driverPanel
            )}
          </div>
        </section>
      )}

      <section id="layanan" className="section alt">
        <div className="section-head">
          <div>
            <h2>Layanan Lengkap</h2>
            <p>Dari mandi sampai penitipan - semuanya friendly dan terjadwal.</p>
          </div>
          <div className="badge">Konsultasi gratis</div>
        </div>
        <div className="bento-grid">
          {bentoTiles.map(tile => (
            <div className={`bento-card ${tile.area}`} key={tile.title}>
              <div className="bento-header">
                <span className="bento-icon">{tile.icon}</span>
                <span className="tag">{tile.tag}</span>
              </div>
              <h3>{tile.title}</h3>
              <p>{tile.desc}</p>
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
                <form className="form-grid" onSubmit={changePassword}>
                  <input placeholder="Password sekarang" type="password" value={passwordForm.current_password} onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })} />
                  <input placeholder="Password baru" type="password" value={passwordForm.new_password} onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })} />
                  {passwordStatus && <small>{passwordStatus}</small>}
                  <button className="btn outline" type="submit">Ubah Password</button>
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
                </select>
                {registerMethod === 'email' ? (
                  <input placeholder="Email" value={registerForm.email} onChange={(e) => {
                    const email = e.target.value
                    setRegisterForm({ ...registerForm, email })
                    setOtpState({ ...otpState, token: '', verified: false, sent: false, message: '' })
                  }} />
                ) : (
                  <input placeholder="Nomor WhatsApp" value={registerForm.phone} onChange={(e) => {
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
              <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
                <input placeholder="Telepon (opsional)" value={googlePhone} onChange={(e) => setGooglePhone(e.target.value)} />
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={googleConsent}
                    onChange={(e) => setGoogleConsent(e.target.checked)}
                  />
                  <span>Saya setuju izin akses Google untuk login/daftar.</span>
                </label>
                <div id="google-signin" />
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

      {user && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>Riwayat Booking</h2>
              <p>Appointment dokter serta grooming/penitipan kamu.</p>
            </div>
            <div className="badge">Update terkini</div>
          </div>
          <div className="checkout-grid">
            <div className="table-card">
              <h3>Appointment Dokter</h3>
              {myAppointments.length === 0 ? (
                <p>Belum ada appointment.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Pet</th><th>Layanan</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {myAppointments.map(a => (
                      <tr key={a.id}>
                        <td>{a.customer_name}</td>
                        <td>{a.pet_name}</td>
                        <td>{a.service_type}</td>
                        <td>{a.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="table-card">
              <h3>Grooming / Penitipan</h3>
              {myServices.length === 0 ? (
                <p>Belum ada booking layanan.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Nama</th><th>Layanan</th><th>Tanggal</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {myServices.map(s => (
                      <tr key={s.id}>
                        <td>{s.customer_name}</td>
                        <td>{s.service_type}</td>
                        <td>{s.date}</td>
                        <td>{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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

      <nav className="bottom-nav" aria-label="Navigasi utama">
        <a className="nav-item" href="#home">
          <span className="nav-icon">{ICONS.home}</span>
          <span>Home</span>
        </a>
        <a className="nav-item" href="#quick">
          <span className="nav-icon">{ICONS.menu}</span>
          <span>Menu</span>
        </a>
        <a className="nav-item" href="#feed">
          <span className="nav-icon">{ICONS.feed}</span>
          <span>Feed</span>
        </a>
        <button className="nav-item" onClick={() => setCartOpen(true)} type="button">
          <span className="nav-icon">{ICONS.cart}</span>
          <span>Cart</span>
          {cartItems.length > 0 && <em className="nav-badge">{cartItems.length}</em>}
        </button>
        <a className="nav-item" href="#member">
          <span className="nav-icon">{ICONS.profile}</span>
          <span>Profile</span>
        </a>
      </nav>

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

const ICONS = {
  home: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11.5L12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
    </svg>
  ),
  menu: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  ),
  feed: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h10" />
    </svg>
  ),
  cart: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 4h2l2.2 9.5a2 2 0 0 0 2 1.5h8.8a2 2 0 0 0 2-1.5L21 7H7.2" />
      <path d="M9 20a1 1 0 1 0 0.01 0" />
      <path d="M18 20a1 1 0 1 0 0.01 0" />
    </svg>
  ),
  profile: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c2.5-4 13.5-4 16 0" />
    </svg>
  ),
  shop: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h16l-1.2 10H5.2L4 9z" />
      <path d="M7 9l1-4h8l1 4" />
    </svg>
  ),
  doctor: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M8 21v-4h8v4" />
      <path d="M11 12h2" />
      <path d="M12 11v3" />
    </svg>
  ),
  grooming: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 6h14" />
      <path d="M8 6v12" />
      <path d="M16 6v12" />
      <path d="M5 18h14" />
    </svg>
  ),
  delivery: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7h12v8H3z" />
      <path d="M15 9h4l2 2v4h-6z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  ),
  voucher: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7z" />
      <path d="M9 7v10" />
    </svg>
  ),
  member: (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l2.5 4.5 5 .7-3.6 3.5.9 5-4.8-2.6-4.8 2.6.9-5L4.5 8.2l5-.7L12 3z" />
    </svg>
  )
}

const demoProducts = [
  { name: 'Whiskas Adult 1.2kg', description: 'Rasa tuna, kaya nutrisi', price: 68000, stock: 25, category: 'Makanan' },
  { name: 'Vitamin Bulu Halus', description: 'Vitamin kulit dan bulu kucing', price: 42000, stock: 30, category: 'Vitamin' },
  { name: 'Pasir Kucing 10L', description: 'Aroma lembut, daya serap tinggi', price: 55000, stock: 18, category: 'Pasir' }
]

const demoSchedules = [
  { doctor_name: 'Drh. Sinta', day_of_week: 'Senin', start_time: '09:00', end_time: '16:00', location: 'Petshop Bento - Cikande' }
]

const promoSlides = [
  {
    badge: 'Promo Spesial',
    title: 'Voucher Welcome + Cashback',
    desc: 'Member baru langsung dapat voucher dan cashback otomatis.',
    tags: ['Voucher 20K', 'Cashback 5%', 'Tanpa minimum']
  },
  {
    badge: 'Super App',
    title: 'Produk + Booking dalam 1 app',
    desc: 'Belanja kebutuhan kucing dan booking dokter tanpa pindah aplikasi.',
    tags: ['Belanja', 'Dokter', 'Grooming']
  },
  {
    badge: 'Delivery',
    title: 'Pengiriman Fleksibel',
    desc: 'Pilih tarif zona, per KM, atau kurir eksternal favoritmu.',
    tags: ['GoSend', 'GrabExpress', 'Kurir lokal']
  }
]

const quickAccess = [
  { label: 'Belanja', href: '#feed', icon: ICONS.shop, badge: 'Promo' },
  { label: 'Dokter', href: '#dokter', icon: ICONS.doctor },
  { label: 'Grooming', href: '#booking', icon: ICONS.grooming },
  { label: 'Delivery', href: '#delivery', icon: ICONS.delivery },
  { label: 'Voucher', href: '#member', icon: ICONS.voucher },
  { label: 'Member', href: '#member', icon: ICONS.member }
]

const bentoTiles = [
  { title: 'Grooming & Spa', desc: 'Mandi, potong kuku, perawatan bulu.', tag: 'Terlaris', icon: ICONS.grooming, area: 'span-2' },
  { title: 'Penitipan Harian', desc: 'Kamar bersih, update foto harian.', tag: 'Aman', icon: ICONS.member, area: 'tall' },
  { title: 'Dokter & Vaksin', desc: 'Jadwal dokter lengkap dan terencana.', tag: 'Berjadwal', icon: ICONS.doctor, area: 'wide' },
  { title: 'Produk Premium', desc: 'Makanan, pasir, vitamin terkurasi.', tag: 'Best pick', icon: ICONS.shop, area: 'wide' },
  { title: 'Delivery Express', desc: 'Same-day untuk area lokal Cikande.', tag: 'Cepat', icon: ICONS.delivery, area: 'span-2' },
  { title: 'Member & Reward', desc: 'Leveling, cashback, voucher rutin.', tag: 'Gamified', icon: ICONS.member, area: 'wide' }
]

const valueProps = [
  { title: 'Produk Terkurasi', desc: 'Stok aman, kualitas terjaga.' },
  { title: 'Layanan Lengkap', desc: 'Grooming, penitipan, vaksin.' },
  { title: 'Member Friendly', desc: 'Diskon, cashback, voucher.' },
  { title: 'Pembayaran Aman', desc: 'Midtrans siap semua metode.' }
]

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mute_beep', String(muteBeep))
    }
  }, [muteBeep])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('driver_mode', String(driverMode))
    }
  }, [driverMode])

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random()
    const duration = type === 'error' ? 3000 : 2000
    setToasts((prev) => [...prev, { id, message, type }].slice(-3))
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, duration)
  }
