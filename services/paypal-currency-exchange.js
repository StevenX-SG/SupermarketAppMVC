// paypal-currency-exchange.js
// PayPal Currency Exchange API Client for Checkout Page

const fetch = require('node-fetch');
require('dotenv').config();

const PAYPAL_BASE_URL = process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

class PayPalCurrencyExchange {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = PAYPAL_BASE_URL;
  }

  /**
   * POST - Create currency exchange quote
   * @param {Object} params - Exchange parameters
   * @param {string} params.baseCurrency - Base currency code (e.g., 'SGD')
   * @param {string} params.baseAmount - Base amount to convert
   * @param {string} params.quoteCurrency - Target currency code (e.g., 'USD')
   * @param {string} params.markupPercent - Markup percentage (default: '0')
   * @param {string} params.fxId - Optional FX ID for rate locking
   * @returns {Promise<Object>} Exchange quote with conversion rate and amount
   */
  async createExchangeQuote({ baseCurrency, baseAmount, quoteCurrency, markupPercent = '0', fxId = null }) {
    try {
      console.log('[PayPalCurrencyExchange] Creating exchange quote:', {
        baseCurrency,
        baseAmount,
        quoteCurrency,
        markupPercent
      });

      const body = {
        quote_items: [{
          base_currency: baseCurrency,
          base_amount: baseAmount.toString(),
          quote_currency: quoteCurrency,
          markup_percent: markupPercent
        }]
      };

      // Add fxId if provided (for rate locking)
      if (fxId) {
        body.quote_items[0].fx_id = fxId;
      }

      const response = await fetch(`${this.baseUrl}/v2/pricing/quote-exchange-rates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[PayPalCurrencyExchange] ✗ Exchange quote creation failed:', data);
        return {
          success: false,
          error: data.message || 'Failed to create exchange quote',
          details: data
        };
      }

      console.log('[PayPalCurrencyExchange] ✓ Exchange quote created successfully');
      console.log('[PayPalCurrencyExchange] Full response:', JSON.stringify(data, null, 2));

      // Extract the first quote from the response
      const quote = data.exchange_rate_quotes?.[0];
      
      if (!quote) {
        console.error('[PayPalCurrencyExchange] ✗ No exchange quotes in response');
        return {
          success: false,
          error: 'No exchange quotes in response',
          details: data
        };
      }

      console.log('[PayPalCurrencyExchange] Quote ID:', quote.fx_id);
      console.log('[PayPalCurrencyExchange] Exchange Rate:', quote.exchange_rate);
      console.log('[PayPalCurrencyExchange] Quote Amount:', quote.quote_amount?.value);

      return {
        success: true,
        id: quote.fx_id,
        quote: quote,
        exchange_rate_quotes: data.exchange_rate_quotes,
        expirationTime: quote.expiry_time,
        data: data
      };
    } catch (err) {
      console.error('[PayPalCurrencyExchange] ERROR creating exchange quote:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
      return {
        success: false,
        error: err.message,
        exception: true
      };
    }
  }

  /**
   * GET - Retrieve currency exchange quote by ID
   * @param {string} fxId - The FX ID (quote ID) to retrieve
   * @returns {Promise<Object>} Exchange quote details
   */
  async getExchangeQuote(fxId) {
    try {
      console.log('[PayPalCurrencyExchange] Retrieving exchange quote:', fxId);

      const response = await fetch(`${this.baseUrl}/v2/pricing/quote-exchange-rates/${fxId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[PayPalCurrencyExchange] ✗ Failed to retrieve exchange quote:', data);
        return {
          success: false,
          error: data.message || 'Failed to retrieve exchange quote',
          details: data
        };
      }

      console.log('[PayPalCurrencyExchange] ✓ Exchange quote retrieved successfully');
      console.log('[PayPalCurrencyExchange] Full response:', JSON.stringify(data, null, 2));

      const quote = data.exchange_rate_quotes?.[0];
      
      return {
        success: true,
        id: quote?.fx_id,
        quote: quote,
        exchange_rate_quotes: data.exchange_rate_quotes,
        expirationTime: quote?.expiry_time,
        data: data
      };
    } catch (err) {
      console.error('[PayPalCurrencyExchange] ERROR retrieving exchange quote:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
      return {
        success: false,
        error: err.message,
        exception: true
      };
    }
  }

  /**
   * Get current exchange rate between two currencies
   * Simplified method that just creates a quote for rate lookup
   * @param {string} baseCurrency - Base currency (e.g., 'SGD')
   * @param {string} targetCurrency - Target currency (e.g., 'USD')
   * @param {string} amount - Amount to convert
   * @returns {Promise<Object>} Exchange rate and converted amount
   */
  async getExchangeRate(baseCurrency, targetCurrency, amount = '1.00') {
    const quote = await this.createExchangeQuote({
      baseCurrency,
      baseAmount: amount,
      quoteCurrency: targetCurrency,
      markupPercent: '0'
    });

    if (!quote.success) {
      console.error('[PayPalCurrencyExchange] Quote creation failed');
      return quote;
    }

    console.log('[PayPalCurrencyExchange] Processing quote response:', quote);

    // Extract quote details from the PayPal response
    const quoteItem = quote.quote;
    
    if (!quoteItem) {
      console.error('[PayPalCurrencyExchange] ✗ No quote item found in response');
      console.error('[PayPalCurrencyExchange] Quote data:', quote);
      return {
        success: false,
        error: 'No quote item in response',
        response: quote
      };
    }

    const baseAmount = parseFloat(quoteItem.base_amount?.value || amount);
    const convertedAmount = parseFloat(quoteItem.quote_amount?.value || 0);
    const exchangeRate = parseFloat(quoteItem.exchange_rate || 0);

    console.log('[PayPalCurrencyExchange] ✓ Exchange calculated successfully:', {
      baseAmount,
      convertedAmount,
      exchangeRate
    });

    return {
      success: true,
      baseCurrency: quoteItem.base_amount?.currency_code || baseCurrency,
      targetCurrency: quoteItem.quote_amount?.currency_code || targetCurrency,
      baseAmount: baseAmount.toFixed(2),
      convertedAmount: convertedAmount.toFixed(2),
      exchangeRate: exchangeRate.toFixed(6),
      fxId: quoteItem.fx_id,
      expirationTime: quoteItem.expiry_time,
      rateRefreshTime: quoteItem.rate_refresh_time
    };
  }
}

/**
 * Helper function to get PayPal access token
 * @returns {Promise<string>} Access token
 */
async function getPayPalAccessToken() {
  try {
    console.log('[PayPalCurrencyExchange] Fetching PayPal access token...');

    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[PayPalCurrencyExchange] ✗ Failed to get access token:', data);
      throw new Error(data.error_description || 'Failed to get PayPal access token');
    }

    console.log('[PayPalCurrencyExchange] ✓ Access token obtained');
    return data.access_token;
  } catch (err) {
    console.error('[PayPalCurrencyExchange] ERROR getting access token:', err.message);
    throw err;
  }
}

/**
 * Create exchange client with fresh access token
 * @returns {Promise<PayPalCurrencyExchange>} Exchange client instance
 */
async function createExchangeClient() {
  const accessToken = await getPayPalAccessToken();
  return new PayPalCurrencyExchange(accessToken);
}

module.exports = {
  PayPalCurrencyExchange,
  createExchangeClient,
  getPayPalAccessToken
};
