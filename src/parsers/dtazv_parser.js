'use strict';
// DTAZV/DTA parser — thin wrapper that re-uses validateDtazv
const { validateDtazv } = require('../validators/dtazv_validator');
function parseDtazv(text) { return validateDtazv(text); }
module.exports = { parseDtazv };
