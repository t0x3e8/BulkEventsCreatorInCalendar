'use strict'

const calendarService = require('./calendarService')
const readline = require('readline')

var app = (function() {
    function initReadLine() {
        return readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        })
    }

    function selectCalendarQuestion(min, max) {
        const rl = initReadLine()

        return new Promise(resolve => {
            rl.setPrompt(`\nSelect calendar number (${min}-${max}): `)
            rl.prompt()

            rl.on('line', function(line) {
                var calendarNumber = Number.parseInt(line)
                if (!isNaN(calendarNumber)) {
                    if (calendarNumber >= min && calendarNumber <= max) {
                        rl.close()
                        return resolve(calendarNumber)
                    }
                }
                rl.prompt()
            })
        })
    }

    function removeAllEventsFirstQuestion() {
        const rl = initReadLine()

        return new Promise((resolve, reject) => {
            rl.resume()
            rl.setPrompt('\nDo you want to remove all events in the calendar first? (Y/N): ')
            rl.prompt()

            rl.on('line', function(line) {
                rl.close()

                resolve(line.trim().toLowerCase() === 'y')
            })
        })
    }

    function createEventsQuestion() {
        const rl = initReadLine()

        return new Promise((resolve, reject) => {
            rl.resume()
            rl.setPrompt('\nDo you want to create all events from "InputCalendar.csv" file? (Y/N): ')
            rl.prompt()

            rl.on('line', function(line) {
                rl.close()
                resolve(line.trim().toLowerCase() === 'y')
            })
        })
    }

    function selectCalendar(auth, calendarService) {
        return new Promise((resolve, reject) => {
            var calendarListPromise = calendarService.listCalendars(auth)

            calendarListPromise.then(
                calendars => {
                    for (let i = 0; i < calendars.data.items.length; i++) {
                        console.log('[' + i + '] ' + calendars.data.items[i].summary)
                    }

                    selectCalendarQuestion(0, calendars.data.items.length - 1).then(calendarId => {
                        let selectedCalendarName = calendars.data.items[calendarId].summary
                        console.log(`Your selection is: "${selectedCalendarName}"`)
                        resolve(calendars.data.items[calendarId].id)
                    })
                },
                err => {
                    console.log(`Error while listening calendars:  ${err}`)
                    reject(err)
                }
            )
        })
    }

    function removeEvents(auth, calendarService, calendarId) {
        return new Promise((resolve, reject) => {
            removeAllEventsFirstQuestion().then(isRemoveAnswer => {
                if (isRemoveAnswer) {
                    calendarService.deleteAllEvents(auth, calendarId).then(() => resolve(), err => reject(err))
                } else {
                    resolve()
                }
            })
        })
    }

    function createEvents(auth, calendarService, calendarId) {
        return new Promise((resolve, reject) => {
            createEventsQuestion().then(isCreateAnswer => {
                if (isCreateAnswer) {
                    calendarService.createEvents(auth, calendarId).then(() => resolve(), err => reject(err))
                } else {
                    resolve()
                }
            })
        })
    }

    function run() {
        console.log('Authorization is starting')
        calendarService.authorize().then(
            auth => {
                console.log('Authorized')

                selectCalendar(auth, calendarService).then(calendarId => {
                    removeEvents(auth, calendarService, calendarId)
                        .then(() => {})
                        .catch(err => {
                            console.log('Error while removing events' + err)
                        })
                        .finally(() => {
                            createEvents(auth, calendarService, calendarId).then(
                                () => {
                                    console.log('All done!')
                                },
                                err => console.log(`${err}`)
                            )
                        })
                })
            },
            err => console.log(`Some problem with authorization. Read 'readme' doc. ${err}`)
        )
    }

    return { run: run }
})()

app.run()
