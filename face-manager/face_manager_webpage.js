const FACE_RES_KEY_ERROR = 'error'
const FACE_RES_KEY_DATA = 'data'
const FACE_API_VERSION = 'v17.0'

/**
 * @type {{
 *  init: Function,
 *  api: Function,
 *  getLoginStatus: Function
 * }}
 */
let facebook
let facebook_app_id
let server_host
/**
 * @type {string}
 */
let api_token
/**
 * @type {Date}
 */
let api_token_expiry = new Date()

window.addEventListener('load', () => {
    const temp_logger_console = document.getElementsByClassName(TempLogger.CMP_CONSOLE_CLASS)[0]
    temp_logger_console.classList.remove('fixed-top')
    temp_logger_console.remove()
    document.getElementById('console-container').appendChild(temp_logger_console)
})

// facebook will call this method when ready
window.fbAsyncInit = function() {
    facebook = FB

    init_logging()
    .then(
        () => {
            console.log('debug logging init complete')
        },
        (err) => {
            console.log(`error logging failure ${err.stack}`)
        }
    )
    .then(() => {
        return http_get('/facebook-app-id')
    })
    .then((app_id_res) => {
        app_id_res = JSON.parse(app_id_res)
        facebook_app_id = app_id_res['app_id']
        server_host = app_id_res['server_host']
        console.log(`info facebook-app-id=${facebook_app_id}`)

        facebook.init({
            appId            : facebook_app_id,
            autoLogAppEvents : true,
            xfbml            : true,
            version          : FACE_API_VERSION
        })

        console.log('info facebook api sdk ready')
    })
    .then(main)
}

function main() {
    // fetch next photo upload request
    http_get('/next-album-photo')
    .then((upload_str) => {
        /**
         * @type {{
         *  local_path: string,
         *  index_idx: number,
         *  mime_type: string,
         *  file_size: number,
         *  exif_meta: Object,
         *  album_id: string,
         *  photo_id: string,
         *  caption: string
         * }}
         */
        let upload = JSON.parse(upload_str)

        if (upload.error !== undefined) {
            console.log(`error unable to fetch next photo upload ${upload.error}`)
            return null
        }
        else {
            console.log(`info next upload = ${JSON.stringify(upload)}`)
            return upload
        }
    })
    // select album
    .then((upload) => {
        return new Promise(function(res) {
            if (upload !== null) {
                if (upload.album_id === null) {
                    console.log(`info upload request does not select an album; pick one`)
    
                    fetch_albums()
                    .then(select_album)
                    .then((album_id) => {
                        upload.album_id = album_id
                        res(upload)
                    })
                }
                else {
                    console.log(`debug upload ${upload.local_path} to album ${upload.album_id}`)
                    res(upload)
                }
            }
            else {
                rej(new Error(`error unable to perform photo uploads without local path(s)`))
            }
        })
    })
    // perform upload
    .then(
        do_upload,
        (err) => {
            console.log(`error cannot perform upload ${err.stack}`)
        }
    )
    // TODO return upload to webserver and proceed to next upload
}

/**
 * @param {{
 *  local_path: string,
 *  mount_path: string,
 *  index_idx: number,
 *  mime_type: string,
 *  file_size: number,
 *  exif_meta: Object,
 *  album_id: string,
 *  photo_id: string,
 *  caption: string
 * }} upload
 * 
 * @returns {boolean}
 */
function do_upload(upload) {
    console.log(`info perform upload ${JSON.stringify(upload)}`)

    refresh_api_login()
    // get photo upload session
    // .then(() => {
    //     return new Promise(function(res, rej) {
    //         facebook.api(
    //             `${facebook_app_id}/uploads`,
    //             'POST',
    //             {
    //                 file_length: upload.file_size,
    //                 file_type: upload.mime_type
    //             },
    //             function(api_res) {
    //                 if (api_res[FACE_RES_KEY_ERROR] !== undefined) {
    //                     rej(api_res[FACE_RES_KEY_ERROR])
    //                 }
    //                 else {
    //                     // resolve upload session id
    //                     res(api_res['id'])
    //                 }
    //             }
    //         )
    //     })
    // })
    // push photo file(s) to facebook via webserver as proxy
    // .then((upload_session_id) => {
    //     console.log(`debug photo upload session id = ${upload_session_id}`)

    //     return new Promise(function(res, rej) {
    //         let url = new URL('/do-uploads', `${window.location.protocol}//${window.location.host}`)
    //         url.searchParams.set('first_upload', JSON.stringify(upload))
    //         url.searchParams.set('api_token', api_token)
    //         url.searchParams.set('app_api_id', facebook_app_id)
    //         url.searchParams.set('api_token_expiry', api_token_expiry.toISOString())
    //         url.searchParams.set('api_version', FACE_API_VERSION)
    //         url.searchParams.set('upload_session_id', upload_session_id)

    //         http_get(url)
    //         .then(
    //             (get_res_str) => {
    //                 let get_res = JSON.parse(get_res_str)

    //                 if (get_res.error !== undefined) {
    //                     console.log(`error ${get_res.error}`)
    //                     rej(get_res.error)
    //                 }
    //                 else {
    //                     console.log(`info ${get_res.message}`)
    //                     res(get_res_str)
    //                 }
    //             },
    //             (err) => {
    //                 console.log(`error ${err.stack}`)
    //                 rej(err)
    //             }
    //         )
    //     })
    // })
    // add photo to album
    .then(() => {
        let caption = 'Image file metadata:'
        if (upload.exif_meta !== null) {
            for (let [key, value] of Object.entries(upload.exif_meta)) {
                caption += `\n${key}: ${value}`
            }
        }
        caption += '\n\nUploaded by [file-manager/face-manager](https://github.com/ogallagher/...).'

        upload.caption = caption
        
        facebook.api(
            `/${upload.album_id}/photos`,
            'POST',
            {
                allow_spherical_photo: undefined,
                spherical_metadata: undefined,
                // TODO parse create date[time] from exif metadata and use here
                backdated_time: null,
                backdated_time_granularity: null,
                caption: upload.caption,
                no_story: true,
                // TODO port forward face-manager:80 to expose image to facebook
                url: `http://${server_host}/mount/${upload.mount_path}/${upload.local_path}`
            },
            function(api_res) {
                if (api_res[FACE_RES_KEY_ERROR] !== undefined) {
                    rej(api_res[FACE_RES_KEY_ERROR])
                }
                else {
                    res(api_res[FACE_RES_KEY_DATA])
                }
            }
        )
    })
}

/**
 * 
 * @param {{
 *  id: string,
 *  description: string,
 *  count: number,
 *  can_upload: boolean,
 *  name: string
 * }[]} albums 
 * @returns {string}
 */
function select_album(albums) {
    return new Promise(function(res) {
        console.log(`info available albums: ${JSON.stringify(albums)}`)
        const parent = document.getElementById('album-select')
        parent.innerHTML = ''
        for (let album of albums) {
            const album_el = document.createElement('div')
            album_el.classList.add('col-auto')
            album_el.innerHTML = (
                `<button 
                    class="btn btn-outline-dark" 
                    data-album-id="${album.id}" data-album-can-upload="${album.can_upload}"
                    ${album.can_upload ? '' : 'disabled'}>
                    <span class="h3">${album.name}</span><br>
                    <span>${album.description || '&lt;no description&gt;'}</span><br>
                    <span>photos count = ${album.count}</span>
                </button>`
            )
            album_el.onclick = function() {
                console.log(`info selected album ${album.name}`)
                parent.innerHTML = ''
                res(album.id)
            }
            parent.appendChild(album_el)
        }
    })
}

/**
 * 
 * @returns {Promise<{
 *  id: string,
 *  description: string,
 *  count: number,
 *  can_upload: boolean,
 *  name: string
 * }[]>}
 */
function fetch_albums() {
    return refresh_api_login()
    .then(() => {
        return new Promise(function(res, rej) {
            facebook.api(
                '/me/albums',
                'GET',
                {
                    fields: 'id,description,count,can_upload,name'
                },
                function(api_res) {
                    if (api_res[FACE_RES_KEY_ERROR] !== undefined) {
                        rej(api_res[FACE_RES_KEY_ERROR])
                    }
                    else {
                        res(api_res[FACE_RES_KEY_DATA])
                    }
                }
            )
        })
    })
}

function refresh_api_login() {
    return new Promise(function(res, rej) {
        /**
         * 
         * @param {{
         *  status: string,
         *  authResponse: {
         *      accessToken: string,
         *      expiresIn: string,
         *      userID: string
         *  }
         * }} login_status 
         */
        function handle_login(login_status, renew = true) {
            let now = new Date()
            console.log(`debug facebook login status = ${login_status.status}`)
            console.log(`debug ${JSON.stringify(login_status)}`)
    
            if (login_status.status === 'connected') {
                api_token = login_status.authResponse.accessToken
                api_token_expiry = now
                let api_token_expiry_sec = parseInt(login_status.authResponse.expiresIn)
                console.log(`api token expires in ${api_token_expiry_sec} seconds`)
                api_token_expiry.setSeconds(api_token_expiry.getSeconds() + api_token_expiry_sec)
                res(api_token)
            }
            else if (renew) {
                console.log('info need new facebook api token; logging in')

                facebook.login(
                    (login) => {
                        // only try login once
                        handle_login(login, false)
                    },
                    {
                        scope: 'public_profile,user_photos'
                    }
                )
            }
            else {
                rej(login_status)
            }
        }

        facebook.getLoginStatus(handle_login)
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