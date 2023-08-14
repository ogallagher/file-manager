// facebook will call this method when ready
window.fbAsyncInit = function() {
    http_get('/facebook-app-id')
    .then((facebook_app_id_str) => {
        let facebook_app_id = JSON.parse(facebook_app_id_str)['value']
        console.log(`info facebook-app-id=${facebook_app_id}`)

        FB.init({
            appId            : facebook_app_id,
            autoLogAppEvents : true,
            xfbml            : true,
            version          : 'v17.0'
        })
    })

    init_logging()
    .then(
        () => {
            console.log('debug logging init complete')
        },
        (err) => {
            console.log(`error logging failure ${err.stack}`)
        }
    )
    .finally(() => {
        main(FB)
    })
}

/**
 * 
 * @param {{
 *  init: Function
 * }} facebook 
 */
function main(facebook) {
    console.log(`info facebook api sdk ready: ${facebook}`)

    // fetch next photo upload request
    http_get('/next-album-photo')
    .then((upload_str) => {
        let upload = JSON.parse(upload_str)

        if (upload.error !== undefined) {
            console.log(`error unable to fetch next photo upload ${upload.error}`)
        }
        else {
            console.log(`info next upload = ${JSON.stringify(upload)}`)
        }
    })
}

/**
 * 
 * @param {Element} console_el 
 * @returns {Promise}
 */
function init_logging() {
    if (TempLogger !== undefined) {
        return TempLogger.config({
            level: 'debug',
            level_gui: 'info',
            with_timestamp: false,
            caller_name: 'face-manager',
            with_lineno: true,
            parse_level_prefix: true,
            with_level: true,
            with_always_level_name: false
        })
    }
    else {
        return Promise.reject('error unable to configure temp_js_logger')
    }
}

/**
 * 
 * @param {string | URL} url 
 * @param {responseType} See {@link XMLHttpRequest.responseType} for accepted values.
 * @returns {Promise<string>} Data from response according to the requested `responseType`.
 */
function http_get(url, responseType='') {
    const http = new XMLHttpRequest()
    http.responseType = responseType
    http.open('GET', url)
    http.send()

    return new Promise(function(res, rej) {
        http.onload = (e) => {
            console.log(`debug loaded from ${url}. responseType=${http.responseType}`)
            
            res(http.response)
        }
        http.onerror = (e) => {
            rej(new Error(`error failed to load ${url}. ${http.responseText} ${e}`))
        }
    })
}

function http_post(url, body, responseType='') {
    const http = new XMLHttpRequest()
    http.responseType = responseType
    http.open('POST', url)
    http.send(body)

    return new Promise(function(res, rej) {
        http.onload = (e) => {
            console.log(`debug posted to ${url}. responseType=${http.responseType}`)
            res(http.response)
        }
        http.onerror = (e) => {
            rej(new Error(`error failed to post to ${url}. ${http.responseText} ${e}`))
        }
    })
}