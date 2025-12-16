window.SocketClient = (function() {
  // const SOCKET_URL = 'https://api.sweepstackz.com';
  const SOCKET_URL = 'https://studentsweeps.com/api';

  const TOKEN_KEY = 'sweepstackz_token';
  const USER_KEY = 'sweepstackz_user';

  let socket = null;
  let isConnected = false;
  const listeners = {};
  let dataLoadedCount = 0;
  const dataLoadedTarget = 4; // prizes, donations, draw:history, paymentOptions (core data)
  let renderTimeout = null;
  let hasRendered = false;
  const pendingEmits = [];  // Queue for failed emits

  // Token management
  const token = {
    get: () => localStorage.getItem(TOKEN_KEY),
    set: (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY),
    clear: () => localStorage.removeItem(TOKEN_KEY)
  };

  // User management
  const user = {
    get: () => {
      try {
        const u = localStorage.getItem(USER_KEY);
        return u ? JSON.parse(u) : null;
      } catch (e) {
        return null;
      }
    },
    set: (u) => u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY),
    clear: () => localStorage.removeItem(USER_KEY)
  };

  // Normalize user object from backend
  function normUser(u) {
    if (!u || typeof u !== 'object') return null;
    return {
      _id: u._id || u.id,
      fullName: u.fullName || u.name || '',
      emailAddress: u.emailAddress || u.email || '',
      phoneNumber: u.phoneNumber || '',
      billingAddress: u.billingAddress || {
        street: '', city: '', state: '', postalCode: '', country: ''
      },
      isAdmin: !!u.isAdmin,
      settings: u.settings || { prizeAlert: false, drawResults: false, newsLetter: false },
      stats: u.stats || { totalOrders: 0, totalEntries: 0, totalSpent: 0, prizesWon: 0 }
    };
  }

  // Event emitter with retry logic
  function emit(event, data = {}) {
    if (!socket || !isConnected) {
      console.warn(`[SocketClient] Not connected. Queueing emit: ${event}`);
      pendingEmits.push({ event, data });
      return false;
    }
    console.log(`[SocketClient] Emitting: ${event}`, data);
    socket.emit(event, data);
    return true;
  }
  
  // Process pending emits after connect
  function processPendingEmits() {
    console.log(`[SocketClient] Processing ${pendingEmits.length} pending emits`);
    while (pendingEmits.length > 0) {
      const { event, data } = pendingEmits.shift();
      console.log(`[SocketClient] Retrying emit: ${event}`);
      socket.emit(event, data);
    }
  }

  // Event listener registration
  function on(event, callback) {
    if (!socket) return;
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
    socket.on(event, callback);
  }

  // Initialize socket connection
  function init() {
    if (!window.io) {
      console.error('[SocketClient] Socket.io not loaded');
      return false;
    }

    const t = token.get();
    console.log('[SocketClient] Initializing with token:', t ? 'present' : 'absent');
    console.log('[SocketClient] Connecting to:', SOCKET_URL);
    console.log('[SocketClient] Socket.io path:', '/api/socket.io');

    // If backend is served under /api, socket.io path should be /api/socket.io
    // If using reverse proxy, the path on server is /socket.io but accessible at /api/socket.io
    const socketOptions = {
      path: '/api/socket.io', // Client-side path: /api/socket.io (matches server accessible path)
      auth: t ? { token: t } : {},
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['polling', 'websocket'] // Match server transports
    };
    
    console.log('[SocketClient] Socket options:', socketOptions);
    
    socket = window.io(SOCKET_URL, socketOptions);

    setupSocketListeners();
    return true;
  }

  // Setup all socket event listeners
  function setupSocketListeners() {
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('error', onError);

    // Auth events
    socket.on('auth:login:success', onAuthLoginSuccess);
    socket.on('auth:signup:success', onAuthSignupSuccess);
    socket.on('auth:status:response', onAuthStatusResponse);

    // User events
    socket.on('user:update:response', onUserUpdateResponse);
    socket.on('user:updated', onUserUpdated);

    // Data events
    socket.on('prizes:list:response', onPrizesListResponse);
    socket.on('donations:list:response', onDonationsListResponse);
    socket.on('donations:new', onDonationsNew);
    socket.on('donations:update', onDonationsUpdate);
    socket.on('donations:delete', onDonationsDelete);
    socket.on('draw:history:response', onDrawHistoryResponse);
    socket.on('winners:list:response', onWinnersListResponse);
    socket.on('winners:all:response', onWinnersAllResponse);
    socket.on('winner:assigned', onWinnerAssigned);
    socket.on('winner:updated', onWinnerUpdated);
    socket.on('winner:deleted', onWinnerDeleted);
    socket.on('entries:myTransactions:response', onMyTransactionsResponse);
    socket.on('paymentOptions:list:response', onPaymentOptionsResponse);
    socket.on('paymentOptions:new', onPaymentOptionsUpdate);
    socket.on('paymentOptions:update', onPaymentOptionsUpdate);
    socket.on('paymentOptions:enabledChanged', onPaymentOptionsUpdate);
    socket.on('settings:get:response', onSettingsResponse);
    socket.on('settings:update', onSettingsUpdate);

    // Purchase events
    socket.on('entries:purchase:invoice', onEntryPurchaseInvoice);
    socket.on('entries:purchase:created', onEntryPurchaseCreated);
    socket.on('donation:purchase:invoice', onDonationPurchaseInvoice);
    socket.on('donation:purchase:created', onDonationPurchaseCreated);
    socket.on('donation:purchase:error', onDonationPurchaseError);

    // Utility events
    socket.on('newsletter:subscribe:response', onNewsletterResponse);
    socket.on('draw:result', onDrawResult);
    socket.on('message:notify', onMessageNotify);
  }

  // Socket lifecycle handlers
  function onConnect() {
    isConnected = true;
    console.log('[SocketClient] Connected successfully to', SOCKET_URL);
    
    // Process any pending emits from before connection
    processPendingEmits();
    
    // Hide loading screen
    const loading = document.getElementById('loading-screen');
    if (loading) {
      loading.style.opacity = '0';
      loading.style.visibility = 'hidden';
    }

    // Set timeout to render even if not all data arrives
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(ensureRender, 3000);
    console.log('[SocketClient] Will render in 3 seconds if no data arrives');

    // Check auth status if token exists
    const t = token.get();
    if (t) {
      console.log('[SocketClient] Token found, checking auth status');
      emit('auth:status', { token: t });
    } else {
      console.log('[SocketClient] No token, requesting initial data');
      requestInitialData();
    }
  }

  function onDisconnect() {
    isConnected = false;
    console.log('[SocketClient] Disconnected');
  }

  function onConnectError(error) {
    // Log detailed error information
    const errorDetails = {
      message: error?.message || 'Unknown connection error',
      type: error?.type || 'unknown',
      description: error?.description || null,
      context: error?.context || null
    };
    
    console.error('[SocketClient] Connection error:', errorDetails);
    
    // Provide user-friendly error message
    if (window.showMessage) {
      let userMessage = 'Unable to connect to server. ';
      if (error?.message === 'server error') {
        userMessage += 'The server is experiencing issues. Please try again in a moment.';
      } else if (error?.message?.includes('timeout')) {
        userMessage += 'Connection timed out. Please check your internet connection.';
      } else if (error?.message?.includes('refused')) {
        userMessage += 'Server is not available. Please try again later.';
      } else {
        userMessage += 'Please refresh the page or try again later.';
      }
      window.showMessage(userMessage, 'error');
    }
  }

  function onError(error) {
    const msg = error?.message || 'Server error';
    console.warn('[SocketClient] Error:', msg);
    if (window.showMessage) window.showMessage(msg, 'error');
  }

  // Auth handlers
  function onAuthLoginSuccess(data) {
    if (!data || !data.user) return;
    console.log('[SocketClient] Login success');
    const t = data.token;
    const u = normUser(data.user);
    if (t) token.set(t);
    if (u) user.set(u);
    if (window.onAuthStateChanged) window.onAuthStateChanged(u);
    if (window.showMessage) window.showMessage('Login successful', 'success');
    if (window.closeAuthModal) window.closeAuthModal();
    requestInitialData();
  }

  function onAuthSignupSuccess(data) {
    console.log('[SocketClient] Signup success');
    if (window.showMessage) window.showMessage('Account created successfully', 'success');
  }

  function onAuthStatusResponse(data) {
    if (!data) return;
    console.log('[SocketClient] Auth status:', data.valid ? 'valid' : 'invalid');
    if (data.valid && data.user) {
      const u = normUser(data.user);
      user.set(u);
      if (window.onAuthStateChanged) window.onAuthStateChanged(u);
      requestInitialData();
    } else {
      user.clear();
      token.clear();
      if (window.onAuthStateChanged) window.onAuthStateChanged(null);
    }
  }

  // User handlers
  function onUserUpdateResponse(data) {
    if (!data || !data.success) return;
    console.log('[SocketClient] User updated');
    const u = normUser(data.user);
    user.set(u);
    if (window.onUserUpdate) window.onUserUpdate(u);
    if (window.showMessage) window.showMessage('Profile updated', 'success');
  }

  function onUserUpdated(data) {
    console.log('[SocketClient] User broadcast update');
    const u = normUser(data);
    user.set(u);
    if (window.onUserUpdate) window.onUserUpdate(u);
  }

  // Data handlers
  function onPrizesListResponse(data) {
    console.log('[SocketClient] onPrizesListResponse received:', JSON.stringify(data).substring(0, 200));
    if (!data) {
      console.warn('[SocketClient] No data received for prizes');
      return;
    }
    // Accept data regardless of success flag - handle both formats
    const prizes = data.prizes || data.data || [];
    console.log('[SocketClient] Prizes set to window:', Array.isArray(prizes), prizes.length || 0, 'items');
    window.PRIZES = Array.isArray(prizes) ? prizes : [];
    dataLoadedCount++;
    // Re-render if on relevant page
    if (window.currentPage === 'home' && window.renderHomePage) {
      console.log('[SocketClient] Re-rendering home page after prizes loaded');
      window.renderHomePage();
    }
    if (window.currentPage === 'prizes' && window.renderAllPrizesPage) window.renderAllPrizesPage();
    if (window.currentPage === 'detail' && window.renderPrizeDetailPage && window.currentPrizeId) {
      console.log('[SocketClient] Re-rendering detail page after prizes loaded, prizeId:', window.currentPrizeId);
      window.renderPrizeDetailPage(window.currentPrizeId);
    }
    if (window.currentPage === 'winners' && window.renderWinnersPage) window.renderWinnersPage();
    checkAllDataLoaded();
  }

  function onDonationsListResponse(data) {
    console.log('[SocketClient] onDonationsListResponse received:', JSON.stringify(data).substring(0, 200));
    if (!data) {
      console.warn('[SocketClient] No data received for donations');
      return;
    }
    let donations = data.donations || data.data || [];
    // Extract partners from content if present
    donations = Array.isArray(donations) ? donations.map(d => {
      let partners = [];
      if (Array.isArray(d.partners)) {
        partners = d.partners;
      } else if (Array.isArray(d.content)) {
        // Look for content item with key 'partners'
        const partnersContent = d.content.find(c => c.key === 'partners');
        if (partnersContent && Array.isArray(partnersContent.value)) {
          // If value is array of objects with 'partners' field, flatten to string or use description
          partners = partnersContent.value.map(p => p.partners || p.description || '').filter(Boolean);
        }
      }
      return { ...d, partners };
    }) : [];
    console.log('[SocketClient] Donations set to window:', Array.isArray(donations), donations.length || 0, 'items', donations);
    window.DONATIONS = donations;
    dataLoadedCount++;
    if (window.currentPage === 'home' && window.renderHomePage) {
      console.log('[SocketClient] Re-rendering home page after donations loaded');
      window.renderHomePage();
    }
    if (window.currentPage === 'donations' && window.renderDonationsPage) window.renderDonationsPage();
    if (window.currentPage === 'donation_detail' && window.currentDonationId && window.renderDonationDetailPage) {
      window.renderDonationDetailPage(window.currentDonationId);
    }
    checkAllDataLoaded();
  }

  function onDonationsNew(data) {
    console.log('[SocketClient] Donation created broadcast received:', data);
    if (data?.success && data?.donation) {
      // Reload donations list to get the latest data
      emit('donations:list', {});
    }
  }

  function onDonationsUpdate(data) {
    console.log('[SocketClient] Donation updated broadcast received:', data);
    if (data?.success && data?.donation) {
      // Reload donations list to get the latest data
      emit('donations:list', {});
    }
  }

  function onDonationsDelete(data) {
    console.log('[SocketClient] Donation deleted broadcast received:', data);
    if (data?.success && data?.donationId) {
      // Reload donations list to get the latest data
      emit('donations:list', {});
    }
  }

  function onDrawHistoryResponse(data) {
    console.log('[SocketClient] onDrawHistoryResponse received:', JSON.stringify(data).substring(0, 200));
    if (!data) {
      console.warn('[SocketClient] No data received for draw history');
      return;
    }
    const results = data.results || data.data || [];
    console.log('[SocketClient] Past prizes set to window:', Array.isArray(results), results.length || 0, 'items');
    window.PAST_PRIZES = Array.isArray(results) ? results : [];
    dataLoadedCount++;
    if (window.currentPage === 'home' && window.renderHomePage) {
      console.log('[SocketClient] Re-rendering home page after past prizes loaded');
      window.renderHomePage();
    }
    checkAllDataLoaded();
  }

  function onWinnersListResponse(data) {
    if (!data || !data.success) return;
    console.log('[SocketClient] Winners list loaded (from transactions):', data.results?.length);
    
    // Store the full transactions in window.TRANSACTIONS for other uses
    const transactions = data.results || [];
    window.TRANSACTIONS = Array.isArray(transactions) ? transactions : [];
    
    // Note: We now use onWinnersAllResponse for winners display (from Winner table)
    // This handler is kept for backward compatibility
  }

  function onWinnersAllResponse(data) {
    if (!data || !data.success) {
      console.warn('[SocketClient] Winners all response failed:', data);
      return;
    }
    console.log('[SocketClient] All winners loaded from Winner table:', data.winners?.length);
    
    // Map winners from Winner table (MongoDB)
    const winners = (data.winners || []).map(winner => {
      const user = winner.user || {};
      const prize = winner.prize || {};
      return {
        _id: winner._id,
        winnerName: user.fullName || user.name || user.emailAddress || 'Anonymous Winner',
        prizeName: prize.name || 'Mystery Prize',
        prizeId: prize._id || prize.id || '',
        imageUrl: winner.imageUrl || user.profileImage || user.profileImageUrl || '',
        description: winner.description || '',
        winDate: winner.createdAt || winner.updatedAt || new Date()
      };
    });
    
    // Store winners from Winner table
    window.WINNERS = winners;
    console.log('[SocketClient] Winners set to window.WINNERS:', winners.length, 'items');
    
    // Re-render winners page if we're on it
    if (window.currentPage === 'winners' && window.renderWinnersPage) {
      console.log('[SocketClient] Re-rendering winners page after all winners loaded');
      window.renderWinnersPage();
    }
  }

  function onWinnerAssigned(data) {
    console.log('[SocketClient] Winner assigned broadcast:', data);
    if (data?.winner) {
      emit('winners:all', {});
    }
  }

  function onWinnerUpdated(data) {
    console.log('[SocketClient] Winner updated broadcast:', data);
    if (data?.winner) {
      emit('winners:all', {});
    }
  }

  function onWinnerDeleted(data) {
    console.log('[SocketClient] Winner deleted broadcast:', data);
    if (data?.winnerId) {
      emit('winners:all', {});
    }
  }

  function onMyTransactionsResponse(data) {
    console.log('[SocketClient] onMyTransactionsResponse received:', data);
    if (!data) return;
    const transactions = data.success === false ? [] : (data.transactions || data.data || []);
    console.log('[SocketClient] Transactions loaded:', transactions.length);
    window.TRANSACTIONS = Array.isArray(transactions) ? transactions : [];
    dataLoadedCount++;
    checkAllDataLoaded();
    // Re-render profile page if user is on it
    if (window.currentPage === 'profile' && window.renderProfilePage) {
      console.log('[SocketClient] Re-rendering profile page after transactions loaded');
      window.renderProfilePage();
    }
  }

  function onPaymentOptionsResponse(data) {
    console.log('[SocketClient] onPaymentOptionsResponse received:', data);
    if (!data) return;
    console.log('[SocketClient] Payment options loaded');
    const options = data.success === false ? [] : (data.paymentOptions || data.data || []);
    window.PAYMENT_OPTIONS = Array.isArray(options) ? options : [];
    dataLoadedCount++;
    checkAllDataLoaded();
    // Re-render payment providers if checkout modal is open
    if (typeof window.renderPaymentProviders === 'function') {
      window.renderPaymentProviders();
    }
  }

  function onPaymentOptionsUpdate(data) {
    console.log('[SocketClient] Payment options update received:', data);
    // Refresh payment options list
    emit('paymentOptions:list', {});
  }

  function onSettingsResponse(data) {
    if (!data || !data.success) return;
    console.log('[SocketClient] Settings loaded');
    window.APP_SETTINGS = data.settings || {};
    if (window.applyTheme) window.applyTheme();
    dataLoadedCount++;
    checkAllDataLoaded();
  }

  function onSettingsUpdate(data) {
    if (!data || !data.success) return;
    console.log('[SocketClient] Settings update broadcast received');
    window.APP_SETTINGS = data.settings || window.APP_SETTINGS || {};
    if (window.applyTheme) window.applyTheme();
  }

  function checkAllDataLoaded() {
    console.log(`[SocketClient] Data loaded: ${dataLoadedCount}/${dataLoadedTarget}`);
    if (!hasRendered && dataLoadedCount >= dataLoadedTarget) {
      hasRendered = true;
      if (renderTimeout) clearTimeout(renderTimeout);
      console.log('[SocketClient] All core data loaded, rendering home page');
      // Hide loading screen when data is loaded
      if (typeof window.hideLoading === 'function') {
        window.hideLoading();
      }
      if (window.renderHomePage) {
        window.renderHomePage();
      }
    }
  }

  function ensureRender() {
    if (!hasRendered && window.PRIZES && window.PRIZES.length > 0) {
      hasRendered = true;
      console.log('[SocketClient] Timeout reached, rendering with available data');
      // Hide loading screen when rendering
      if (typeof window.hideLoading === 'function') {
        window.hideLoading();
      }
      if (window.renderHomePage) {
        window.renderHomePage();
      }
    }
  }

  function onEntryPurchaseInvoice(data) {
    if (!data) {
      console.warn('[SocketClient] Entry purchase invoice received with no data');
      return;
    }
    console.log('[SocketClient] Entry purchase invoice received:', JSON.stringify(data).substring(0, 500));
    
    // For Malum, the URL is in data.invoice.url; for NowPayments, the URL is in data.invoice.invoice_url
    let url = null;
    if (data.invoice) {
      if (typeof data.invoice === 'object') {
        url = extractInvoiceUrl(data.invoice);
        console.log('[SocketClient] Extracted invoice URL:', url);
      } else if (typeof data.invoice === 'string') {
        // Sometimes invoice might be a direct URL string
        url = data.invoice;
        console.log('[SocketClient] Invoice is direct URL string:', url);
      }
    }
    
    // Also check if URL is at top level (fallback)
    if (!url && data.url) {
      url = data.url;
      console.log('[SocketClient] Found URL at top level:', url);
    }
    
    if (url && url.trim() !== '') {
      console.log('[SocketClient] Redirecting to payment URL:', url);
      window.location.href = url;
      if (window.showMessage) window.showMessage('Redirecting to payment...', 'success');
    } else {
      console.error('[SocketClient] No invoice URL found in entry purchase response. Full data:', JSON.stringify(data));
      if (window.showMessage) window.showMessage('Payment link not available. Please contact support.', 'error');
    }
  }

  function onEntryPurchaseCreated(data) {
    console.log('[SocketClient] Entry purchase created:', data.trxID);
    if (window.showMessage) window.showMessage('Order created: ' + data.trxID, 'success');
    setTimeout(() => requestMyTransactions(), 500);
  }

  function onDonationPurchaseInvoice(data) {
    if (!data) {
      console.warn('[SocketClient] Donation purchase invoice received with no data');
      return;
    }
    console.log('[SocketClient] Donation purchase invoice received:', JSON.stringify(data).substring(0, 500));
    
    // For Malum, the URL is in data.invoice.url; for NowPayments, the URL is in data.invoice.invoice_url
    let url = null;
    if (data.invoice) {
      if (typeof data.invoice === 'object') {
        url = extractInvoiceUrl(data.invoice);
        console.log('[SocketClient] Extracted donation invoice URL:', url);
      } else if (typeof data.invoice === 'string') {
        url = data.invoice;
        console.log('[SocketClient] Donation invoice is direct URL string:', url);
      }
    }
    
    // Also check if URL is at top level (fallback)
    if (!url && data.url) {
      url = data.url;
      console.log('[SocketClient] Found donation URL at top level:', url);
    }
    
    if (url && url.trim() !== '') {
      console.log('[SocketClient] Redirecting to donation payment URL:', url);
      window.location.href = url;
      if (window.showMessage) window.showMessage('Redirecting to payment...', 'success');
    } else {
      console.error('[SocketClient] No invoice URL found in donation purchase response. Full data:', JSON.stringify(data));
      if (window.showMessage) window.showMessage('Payment link not available. Please contact support.', 'error');
    }
  }

  function onDonationPurchaseCreated(data) {
    console.log('[SocketClient] Donation created:', data.trxID);
    if (window.showMessage) window.showMessage('Thank you! ' + data.trxID, 'success');
    setTimeout(() => requestMyTransactions(), 500);
  }

  function onDonationPurchaseError(data) {
    console.log('[SocketClient] Donation purchase error');
    if (window.showMessage) window.showMessage('Donation failed: ' + (data?.message || 'Unknown error'), 'error');
  }

  // Utility handlers
  function onNewsletterResponse(data) {
    if (!data) return;
    if (window.showMessage) window.showMessage(data.message || 'Subscribed', 'success');
  }

  function onDrawResult(data) {
    if (!data) return;
    const prize = data.prize?.name || 'Prize';
    const winner = data.winner?.fullName || 'Winner';
    if (window.showMessage) window.showMessage(`🎉 ${prize} won by ${winner}!`, 'info');
  }

  function onMessageNotify(data) {
    if (!data) return;
    if (window.showMessage) window.showMessage(data.message || 'Notification', 'info');
    emit('message:notify:ack', { messageId: data.id });
  }

  // Helper functions
  function extractInvoiceUrl(invoice) {
    if (!invoice) {
      console.warn('[SocketClient] extractInvoiceUrl called with no invoice');
      return null;
    }
    
    // If it's a string (and looks like a URL), use it
    if (typeof invoice === 'string') {
      if (invoice.startsWith('http://') || invoice.startsWith('https://')) {
        return invoice;
      }
      return null;
    }
    
    // If it's an object, look for URL in various property names
    if (typeof invoice === 'object') {
      const fields = ['url', 'invoice_url', 'payment_url', 'hosted_url', 'paymentUrl', 'invoiceUrl', 'checkout_url', 'link', 'checkout_link'];
      for (const f of fields) {
        if (invoice[f] && typeof invoice[f] === 'string') {
          const foundUrl = invoice[f];
          console.log('[SocketClient] Found URL in field "' + f + '":', foundUrl);
          return foundUrl;
        }
      }
      
      // Check nested objects (e.g., invoice.data.url)
      if (invoice.data && typeof invoice.data === 'object') {
        for (const f of fields) {
          if (invoice.data[f] && typeof invoice.data[f] === 'string') {
            const foundUrl = invoice.data[f];
            console.log('[SocketClient] Found URL in nested data.' + f + ':', foundUrl);
            return foundUrl;
          }
        }
      }
    }
    
    console.warn('[SocketClient] No URL found in invoice object:', JSON.stringify(invoice).substring(0, 200));
    return null;
  }

  function requestInitialData() {
    emit('prizes:list', {});
    emit('donations:list', {});
    emit('draw:history', { limit: 50, skip: 0 });
    emit('winners:list', {});
    emit('winners:all', {}); // Get all winners with prize details
    emit('paymentOptions:list', {});
    emit('settings:get', {});
    const u = user.get();
    if (u) emit('entries:myTransactions', { userId: u._id });
  }

  function requestMyTransactions() {
    const u = user.get();
    if (u) emit('entries:myTransactions', { userId: u._id });
  }

  function changePage(page, tab = null, event = null) {
    if (event) event.preventDefault();
    if (window.scrollTo) window.scrollTo(0, 0);
    
    // Emit data refresh based on page
    if (['home', 'prizes', 'detail'].includes(page)) emit('prizes:list', {});
    if (['home', 'donations', 'donation_detail'].includes(page)) emit('donations:list', {});
    if (page === 'home') emit('draw:history', { limit: 50, skip: 0 });
    if (page === 'winners') emit('winners:all', {});
    if (page === 'profile') {
      const u = user.get();
      if (u) emit('entries:myTransactions', { userId: u._id });
    }

    // Call the appropriate page renderer
    if (window.changePage) window.changePage(page, tab);
  }

  // Public API
  return {
    init,
    emit,
    on,
    getToken: token.get,
    setToken: token.set,
    clearToken: token.clear,
    getUser: user.get,
    setUser: user.set,
    clearUser: user.clear,
    normUser,
    isConnected: () => isConnected,
    requestInitialData,
    requestMyTransactions,
    changePage,
    _getSocket: () => socket
  };
})();
