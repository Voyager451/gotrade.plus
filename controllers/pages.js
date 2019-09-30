/**
 * GET /about
 * Our humble about page
 */

exports.indexAbout = (req, res) => {
  res.render('about', {
    title: '',
    darkMode: req.app.locals.darkMode
  });
};
