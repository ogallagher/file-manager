// facebook will call this method when ready
window.fbAsyncInit = function() {
    http_get('/facebook-app-id')
    .then((facebook_app_id_str) => {
        facebook_app_id = JSON.parse(facebook_app_id_str)['value']
        console.log(`info facebook-app-id=${facebook_app_id}`)

        FB.init({
            appId            : facebook_app_id,
            autoLogAppEvents : true,
            xfbml            : true,
            version          : 'v17.0'
        })
    })

    main(FB)
}

/**
 * 
 * @param {{
 *  init: Function
 * }} facebook 
 */
function main(facebook) {
    console.log(`info facebook api sdk ready: ${facebook}`)
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