/**
 * Helper functions
 */

const helpers = {
	decodeURIPlus: function (str) {
		return decodeURIComponent(str.split('+').join('%20'));
	}
};

module.exports = helpers;