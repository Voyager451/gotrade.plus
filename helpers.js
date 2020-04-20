/**
 * Helper functions
 */

const helpers = {
    decodeURIPlus(str) {
        return decodeURIComponent(str.split('+').join('%20'));
    },
};

module.exports = helpers;
