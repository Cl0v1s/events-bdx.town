const Mastodon = require('mastodon-api');
const config = require('./config');

(async () => {
    // console.log(await Mastodon.createOAuthApp('https://bdx.town/api/v1/apps', 'events-bot'));
    console.log(await Mastodon.getAuthorizationUrl(config.client_id, config.client_secret, "https://bdx.town"))
    // console.log(await Mastodon.getAccessToken(config.client_id, config.client_secret, config.authorizationCode, "https://bdx.town"))
})();