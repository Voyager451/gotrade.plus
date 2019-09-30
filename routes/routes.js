const express = require('express');
const router = express.Router();

/**
 * Controllers (route handlers).
 */
const homeController = require('../controllers/home');
const searchController = require('../controllers/search');
const pagesController = require('../controllers/pages');

/**
 * Primary routes
 */
router.get('/', homeController.index);
router.get('/search', searchController.index);
router.get('/about', pagesController.indexAbout);

/**
 * Ajax routes
 */
router.post('/ajax/get_trade_body', homeController.getTradeBody);
router.post('/ajax/get_trade_live_data', homeController.getTradeLiveData);
router.post('/ajax/search', searchController.ajax);

module.exports = router;