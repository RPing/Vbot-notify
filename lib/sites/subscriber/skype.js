const request = require('requestretry')
const qs = require('querystring')

class skype {
    notify(chat_id, project_name, release_page, version_info) {
        const appId = process.env.SKYPE_APP_ID
        const appSecret = process.env.SKYPE_APP_SECRET

        const that = this
        this._requestToken(appId, appSecret, function (err, token) {
            if (err) {
                console.error(err)
            }

            const msg = that._format(project_name, version_info, release_page)

            that._sendMsg(appId, appSecret, token, chat_id, msg)
        })

    }

    _format(name, info, page) {
        let str = `**${name}** has new version!!\n\n`
        info.forEach((item) => {
            str += `*${item.version}* released at ${item.date}\n\n`
        })
        str += `[Check it out!](${page})`
        return str
    }

    _sendMsg(appId, appSecret, accessToken, chat_id, msg) {
        const options = {
            url: `https://smba.trafficmanager.net/apis/v3/conversations/${chat_id}/activities`,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            json: {
                text: msg,
                type: 'message',
                textFormat: 'markdown',
            },
            maxAttempts: 3,
            retryDelay: 500,
        }

        request(options, (err, res) => {
            if (err)
                console.error(err)
            if (typeof res === 'undefined')
                console.error(new Error(`Timeout Error. res object is ${res}`))
            if (res.statusCode !== 201)
                console.error(new Error(`res code is ${res.statusCode}, body is ${res.body}`))
        })
    }

    _requestToken(appId, appSecret, cb) {

        const data = qs.encode({
            grant_type: 'client_credentials',
            client_id: appId,
            client_secret: appSecret,
            scope: 'https://api.botframework.com/.default'
        })

        const options = {
            url: 'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token',
            method: 'POST',
            headers: {
              'cache-control': 'no-cache',
              'content-type': 'application/x-www-form-urlencoded',
              'content-length': Buffer.byteLength(data)
            },
            body: data,
            retryDelay: 500,
        }

        request(options, (err, res) => {
            if (err) {
                cb(err)
            }

            const body = JSON.parse(res.body)
            cb(null, body.access_token)
        })

    }
}
module.exports = skype