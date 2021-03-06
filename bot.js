const async = require('async')
const isEqual = require('lodash.isequal')
const uniqWith = require('lodash.uniqwith')

const db = require('./lib/db')
const site = require('./lib/site-utils')

const checkTime = new Date()
checkTime.setDate(checkTime.getDate() - process.env.CHECK_DAYS) // current time - CHECK_DAYS

const postNotifyMsg =
    'If you have any question, post an issue in\nhttps://github.com/RPing/Ver.bot-notify/issues\n' +
    'Or if you find some security issue, contact me\ng1222888@gmail.com\n' +
    'To support AWS Lambda and EC2 running, please donate\nhttps://www.paypal.me/RPing'

function needToNotify(results) {
    const hasNewVer = results.info.length > 0
    const hasSubscriber = results.subscribers.length > 0

    return hasNewVer && hasSubscriber
}

function notify(projectPlatform, projectName, releasePage, results, cb) {
    async.map(results.subscribers, async.reflect(function notifySubscriber(subscriber, cb_) {
        site.siteUtil(subscriber.platform)
            .notify(subscriber.id, projectName, releasePage, results.info, (err) => {
                if (err) {
                    console.error('---- error when send to a subscriber ----')
                    console.error(projectPlatform, projectName, subscriber.id)
                    console.error(err)
                    return cb_(err)
                }
                cb_(null)
            })
    }), function parallelCallback(err, parallel_results) {
        const hasSomeError = parallel_results.some(result => result.error !== undefined)

        cb(hasSomeError)
    })
}

function postNotify(subscribers, cb) {
    async.map(subscribers, async.reflect(function sendPostNotifyMsg(subscriber, cb_) {
        site.siteUtil(subscriber.platform)
            .send(subscriber.id, postNotifyMsg, (err) => {
                if (err) {
                    console.error('---- error when post-notify ----')
                    console.error(subscriber.platform, subscriber.id)
                    console.error(err)
                    return cb_(err)
                }
                cb_(null)
            })
    }), function parallelCallback(err, parallel_results) {
        const hasSomeError = parallel_results.some(result => result.error !== undefined)

        cb(hasSomeError)
    })
}

function checkAndNotify(results, projectInfo, projectName, projectPlatform, cb) {
    if (needToNotify(results)) {
        async.series([
            function (inner_cb) {
                const releasePage = site.siteUtil(projectPlatform).getReleasesPage(projectInfo)
                notify(projectPlatform, projectName, releasePage, results, inner_cb)
            }
        ], function seriesCallback(err) {
            if (err)
                return cb(new Error(`failed project name: ${projectName}`))

            cb(null, results.subscribers)
        })
    } else
        cb(null, [])
}

/*
    use Project platform util to get new version info
    query DB project subscriber
    use Chat platform util to notify subscriber
 */
function survey_notify(projectList, cb) {
    async.map(projectList, async.reflect(function surveyAndNotify(projectInfo, cb_) {
        const projectPlatform = db.projectPlatform(projectInfo.platform)
        const projectName = projectInfo.project_name

        async.series(
            {
                info(inner_cb) {
                    site.siteUtil(projectPlatform)
                        .getNewVersionInfo(checkTime, projectInfo, inner_cb)
                },
                subscribers(inner_cb) {
                    db.getAllSubscriber(projectName, inner_cb)
                },
            },
            function afterSurveyCallback(err, results) {
                if (err) {
                    console.error('---- error when survey the project ----')
                    console.error(projectPlatform, projectName)
                    console.error(err)
                    return cb_(err)
                }

                checkAndNotify(results, projectInfo, projectName, projectPlatform, cb_)
            }
        )
    }), function parallelCallback(err, results) {
        const hasSomeError = results.some(result => result.error !== undefined)

        // can't return here, since other success cases still need to handle.
        if (hasSomeError)
            cb(new Error('Some error happened'))

        // retrieve subscriber information, and send post-depoly message.
        let subscribers = []
        results.forEach((result) => {
            if (Array.isArray(result.value) && result.value.length > 0)
                subscribers = subscribers.concat(result.value)
        })

        const filterSubscribers = uniqWith(subscribers, isEqual)
        postNotify(filterSubscribers, cb)
    })
}

exports.handler = function (event, context, callback) {
    async.waterfall([
        db.getAllProject,
        survey_notify,
    ], (err, result) => {
        if (err)
            callback(err)

        callback(null)
    })
}
