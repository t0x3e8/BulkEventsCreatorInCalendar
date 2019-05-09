const fs = require('fs')
const readline = require('readline')
const { google } = require('googleapis')
const path = require('path')
const exponentialBackoff = require('exponential-backoff')

var calenderService = (function() {
    // If modifying these scopes, delete token.json.
    const SCOPES = ['https://www.googleapis.com/auth/calendar ']
    // The file token.json stores the user's access and refresh tokens, and is
    // created automatically when the authorization flow completes for the first
    // time.
    const TOKEN_PATH = path.join(__dirname, 'token.json')
    // The file acting as the input of events
    const INPUT_DATA_PATH = path.join(__dirname, 'InputCalendar-test.csv')
    const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json')
    const TIMEOUT_INTERVAL = 3000000
    const MAX_RESULT_EVENT_REMOVAL = 2500
    const TRANSACTION_RATE_LIMIT = 400

    var authorizeClient = function() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        function askCode() {
            return new Promise(resolve => {
                rl.question('Enter the code from that page here: ', code => {
                    rl.close()
                    resolve(code)
                })
            })
        }

        var authorize = function(credentials) {
            return new Promise((resolve, reject) => {
                const {
                    // eslint-disable-next-line camelcase
                    client_secret,
                    // eslint-disable-next-line camelcase
                    client_id,
                    // eslint-disable-next-line camelcase
                    redirect_uris
                } = credentials.installed
                const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

                // Check if we have previously stored a token.
                fs.readFile(TOKEN_PATH, (err, token) => {
                    if (err) resolve(getAccessToken(oAuth2Client))
                    else {
                        oAuth2Client.setCredentials(JSON.parse(token))
                        resolve(oAuth2Client)
                    }
                })
            })
        }

        /**
         * Get and store new token after prompting for user authorization
         * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
         */
        var getAccessToken = function(oAuth2Client) {
            return new Promise((resolve, reject) => {
                const authUrl = oAuth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES
                })
                console.log('Authorize this app by visiting this url:', authUrl)

                askCode().then(code => {
                    oAuth2Client.getToken(code, (err, token) => {
                        if (err) {
                            return reject(new Error(`Error retrieving access token: ${err}`))
                        }

                        oAuth2Client.setCredentials(token)
                        // Store the token to disk for later program executions
                        fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
                            if (err) return reject(err)

                            console.log('Token stored to', TOKEN_PATH)
                        })
                        return resolve(oAuth2Client)
                    })
                })
            })
        }

        return new Promise((resolve, reject) => {
            // Load client secrets from a local file.
            fs.readFile(CREDENTIALS_PATH, (err, content) => {
                if (err) {
                    return reject(new Error(`Error loading client secret file:'${err}`))
                }

                authorize(JSON.parse(content))
                    .then(function(oAuth2Client) {
                        resolve(oAuth2Client)
                    })
                    .catch(function(err) {
                        console.log(err)
                    })
            })
        })
    }

    var listCalendars = function(auth) {
        const calendar = google.calendar({ version: 'v3', auth })
        return calendar.calendarList.list()
    }

    var deleteAllEvents = function(auth, calendarId) {
        const calendar = google.calendar({ version: 'v3', auth })

        return new Promise((resolve, reject) => {
            return calendar.events
                .list({
                    calendarId: calendarId,
                    singleEvents: true,
                    maxResults: MAX_RESULT_EVENT_REMOVAL
                })
                .then(
                    events => {
                        console.log(`--> Deleting events. Total number of events is ${events.data.items.length}`)

                        setTimeout(() => reject(new Error('time out')), TIMEOUT_INTERVAL)
                        var delay = 0
                        var actions = events.data.items.map((event, index) => {
                            delay += TRANSACTION_RATE_LIMIT

                            return exponentialBackoff.backOff(
                                () => {
                                    return new Promise((resolve, reject) => {
                                        calendar.events
                                            .delete({
                                                calendarId: calendarId,
                                                eventId: event.id
                                            })
                                            .then(
                                                () => {
                                                    console.log(`---> Deleted ${index}: ${event.summary}`)
                                                    resolve()
                                                },
                                                err => {
                                                    console.log(`Error while removing event ${index}: ${err}`)
                                                    reject(err)
                                                }
                                            )
                                    })
                                },
                                {
                                    delayFirstAttempt: true,
                                    numOfAttempts: 1,
                                    startingDelay: delay
                                }
                            )
                        })

                        return Promise.all(actions)
                            .then(() => resolve())
                            .catch(err => console.log(`whOOOOt! ${err}`))
                    },
                    err => reject(err)
                )
        })
    }

    var buildEventDefinition = function(eventName, personName, date) {
        let dateSplit = date.split('.')
        let currentDate = new Date()
        // 2011-09-30
        let eventDateString = `${currentDate.getFullYear()}-${dateSplit[1]}-${dateSplit[0]}`
        // var isDateCorrect = function(year, month, day) {
        //     var dateToValidate = new Date(year, month, day)
        //     return dateToValidate.getFullYear() == year && dateToValidate.getMonth() == month && dateToValidate.getDate() == day
        // }

        // if (!isDateCorrect(currentDate.getFullYear(), dateSplit[1], dateSplit[0])) {
        //     var dayNumber = Number(dateSplit[0]) - 1
        //     eventDateString = `${currentDate.getFullYear()}-${dateSplit[1]}-${dayNumber}`
        // }

        return {
            summary: `${personName} ${eventName}`,
            description: date,
            start: {
                date: eventDateString
            },
            end: {
                date: eventDateString
            },
            recurrence: ['RRULE:FREQ=YEARLY;COUNT=10'],
            attendees: [{ email: 'jaju@dgs.com' }],
            reminders: {
                useDefault: true
            }
        }
    }

    var readFile = function() {
        return new Promise(resolve => {
            var records = []
            var rl = readline.createInterface({
                input: fs.createReadStream(INPUT_DATA_PATH),
                crlfDelay: Infinity
            })

            rl.on('line', line => {
                var words = line.split(';')
                records.push({
                    subject: 'Work anniversary',
                    person: words[0],
                    date: words[1]
                })
                records.push({
                    subject: 'Birthday',
                    person: words[0],
                    date: words[2]
                })
            })

            rl.on('close', () => resolve(records))
        })
    }

    var createEvents = function(auth, calendarId) {
        const calendar = google.calendar({ version: 'v3', auth })

        return new Promise((resolve, reject) => {
            return readFile().then(records => {
                var delay = 0

                var actions = records.map((record, index) => {
                    var eventData = buildEventDefinition(record.subject, record.person, record.date)

                    delay += TRANSACTION_RATE_LIMIT
                    return exponentialBackoff.backOff(
                        () => {
                            return new Promise((resolve, reject) => {
                                calendar.events
                                    .insert({
                                        calendarId: calendarId,
                                        resource: eventData
                                    })
                                    .then(
                                        () => {
                                            console.log(`---> Created ${index}: ${eventData.summary}`)
                                            resolve()
                                        },
                                        err => {
                                            console.log(`Error while creating event ${index} ${eventData.summary}: ${err}`)
                                            reject(err)
                                        }
                                    )
                            })
                        },
                        {
                            delayFirstAttempt: true,
                            numOfAttempts: 10,
                            startingDelay: delay
                        }
                    )
                })

                return Promise.all(actions)
                    .then(() => resolve())
                    .catch(err => reject(err))
            })
        })
    }

    return {
        authorize: authorizeClient,
        listCalendars: listCalendars,
        createEvents: createEvents,
        deleteAllEvents: deleteAllEvents,
        ping: function() {
            console.log('ping-pong')
        }
    }
})()

module.exports = calenderService
