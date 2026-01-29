const fetch = require('node-fetch');
require('dotenv').config();

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_API = process.env.PAYPAL_API;

async function getAccessToken() {
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(PAYPAL_CLIENT + ':' + PAYPAL_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await response.json();
  return data.access_token;
}

async function createOrder(amount, currencyCode = 'SGD') {
  const accessToken = await getAccessToken();
  
  console.log('[PayPal.createOrder] Creating order with:', {
    amount,
    currencyCode
  });
  
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currencyCode,
          value: amount
        }
      }]
    })
  });
  
  const data = await response.json();
  console.log('[PayPal.createOrder] Order created:', {
    orderId: data.id,
    currency: currencyCode,
    amount
  });
  
  return data;
}

// Get order details (including already-captured payment info)
async function getOrderDetails(orderId) {
  try {
    console.log('\n[PayPal.getOrderDetails] Fetching order details for orderId:', orderId);
    const accessToken = await getAccessToken();
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const data = await response.json();
    
    console.log('[PayPal.getOrderDetails] ═══════════════════════════════════════════');
    console.log('[PayPal.getOrderDetails] RAW ORDER DETAILS FROM PayPal:');
    console.log('[PayPal.getOrderDetails] HTTP Status:', response.status, response.statusText);
    console.log('[PayPal.getOrderDetails] ═══════════════════════════════════════════');
    console.log(JSON.stringify(data, null, 2));
    console.log('[PayPal.getOrderDetails] ═══════════════════════════════════════════\n');
    
    return data;
  } catch (err) {
    console.error('[PayPal.getOrderDetails] ERROR:', err.message);
    throw err;
  }
}

async function captureOrder(orderId) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  });
  const data = await response.json();
  
  console.log('\n[PayPal.captureOrder] ═══════════════════════════════════════════');
  console.log('[PayPal.captureOrder] RAW RESPONSE FROM PayPal /capture ENDPOINT:');
  console.log('[PayPal.captureOrder] HTTP Status:', response.status, response.statusText);
  console.log('[PayPal.captureOrder] ═══════════════════════════════════════════');
  console.log(JSON.stringify(data, null, 2));
  console.log('[PayPal.captureOrder] ═══════════════════════════════════════════\n');
  
  // Extract and log currency code from response
  if (data.purchase_units?.[0]?.amount?.currency_code) {
    console.log('[PayPal.captureOrder] ✓ Currency Code from response:', data.purchase_units[0].amount.currency_code);
    data.responsePaymentCurrency = data.purchase_units[0].amount.currency_code;
  }
  
  // Inspect the actual structure
  console.log('[PayPal.captureOrder] Analyzing response structure:');
  console.log('[PayPal.captureOrder] Top-level keys:', Object.keys(data || {}));
  
  if (data.purchase_units) {
    console.log('[PayPal.captureOrder] ✓ purchase_units exists (length: ' + data.purchase_units.length + ')');
    if (data.purchase_units[0]) {
      console.log('[PayPal.captureOrder] purchase_units[0] keys:', Object.keys(data.purchase_units[0] || {}));
      
      if (data.purchase_units[0].payments) {
        console.log('[PayPal.captureOrder] ✓ payments object exists');
        console.log('[PayPal.captureOrder] payments keys:', Object.keys(data.purchase_units[0].payments || {}));
        
        if (data.purchase_units[0].payments.captures) {
          console.log('[PayPal.captureOrder] ✓ captures array exists');
          if (data.purchase_units[0].payments.captures[0]) {
            console.log('[PayPal.captureOrder] ✓ captures[0] exists');
            console.log('[PayPal.captureOrder] captures[0] keys:', Object.keys(data.purchase_units[0].payments.captures[0] || {}));
            
            if (data.purchase_units[0].payments.captures[0].id) {
              const captureId = data.purchase_units[0].payments.captures[0].id;
              console.log('[PayPal.captureOrder] ✓✓✓ FOUND CAPTURE ID:', captureId);
              data.captureId = captureId;
            } else {
              console.warn('[PayPal.captureOrder] ✗ captures[0].id does NOT exist');
            }
          }
        } else {
          console.warn('[PayPal.captureOrder] ✗ captures array NOT found. Available:', Object.keys(data.purchase_units[0].payments || {}));
        }
      } else {
        console.warn('[PayPal.captureOrder] ✗ payments object NOT found. Available:', Object.keys(data.purchase_units[0] || {}));
      }
    }
  } else {
    console.warn('[PayPal.captureOrder] ✗ purchase_units NOT found in response');
  }
  
  return data;
}

// Refund a captured payment using captureId (direct method)
async function refundCapture(captureId, amount, currencyCode = 'SGD') {
  try {
    console.log('[PayPal.refundCapture] ╔════════════════════════════════════╗');
    console.log('[PayPal.refundCapture] ║ PAYPAL REFUND REQUEST INITIATED   ║');
    console.log('[PayPal.refundCapture] ╚════════════════════════════════════╝');
    console.log('[PayPal.refundCapture] Input parameters:', { 
      captureId, 
      amount,
      currency: currencyCode
    });
    
    const accessToken = await getAccessToken();
    console.log('[PayPal.refundCapture] ✓ Access token obtained');
    
    console.log('[PayPal.refundCapture] Calling PayPal refund endpoint...');
    const response = await fetch(`${PAYPAL_API}/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: {
          currency_code: currencyCode,
          value: amount.toString()
        }
      })
    });
    
    const refundData = await response.json();
    
    if (response.ok) {
      console.log('[PayPal.refundCapture] ✓✓✓ REFUND SUCCESSFUL ✓✓✓');
      console.log('[PayPal.refundCapture] Refund details:', {
        refundId: refundData.id,
        status: refundData.status,
        amount: refundData.amount,
        createTime: refundData.create_time
      });
      console.log('[PayPal.refundCapture] ╔════════════════════════════════════╗');
      console.log('[PayPal.refundCapture] ║ SANDBOX REFUND COMPLETE            ║');
      console.log('[PayPal.refundCapture] ╚════════════════════════════════════╝');
      
      return {
        success: true,
        refundId: refundData.id,
        status: refundData.status,
        amount: refundData.amount,
        createTime: refundData.create_time,
        raw: refundData
      };
    } else {
      console.error('[PayPal.refundCapture] ✗ REFUND FAILED');
      console.error('[PayPal.refundCapture] PayPal error response:', {
        httpStatus: response.status,
        message: refundData.message,
        details: refundData.details,
        fullResponse: refundData
      });
      return {
        success: false,
        httpStatus: response.status,
        error: refundData.message || 'Unknown PayPal error',
        details: refundData
      };
    }
  } catch (err) {
    console.error('[PayPal.refundCapture] ✗✗✗ EXCEPTION THROWN ✗✗✗');
    console.error('[PayPal.refundCapture] Error:', {
      message: err.message,
      code: err.code,
      stack: err.stack
    });
    return {
      success: false,
      error: err.message,
      code: err.code
    };
  }
}

module.exports = { createOrder, captureOrder, getOrderDetails, refundCapture };