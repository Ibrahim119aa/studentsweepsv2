function success(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function error(res, status = 500, message = 'Error occurred') {
  return res.status(status).json({ success: false, message });
}

module.exports = { success, error };
