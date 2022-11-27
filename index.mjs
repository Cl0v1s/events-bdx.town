import fetch from 'node-fetch';
import config from './config.js';
import { exit } from 'process';

const format = {
    "day": "2-digit",
    "month": "2-digit",
    "year": "numeric"
};

const BDXMETROPOLE_URL = "https://www.bordeaux-metropole.fr";
const MOBILIZON_URL = "https://mobilizon.fr/events/";
const INSTANCE = "https://bdx.town"

function decodeEntities(encodedString) {
    var translate_re = /&(nbsp|amp|quot|lt|gt);/g;
    var translate = {
        "nbsp":" ",
        "amp" : "&",
        "quot": "\"",
        "lt"  : "<",
        "gt"  : ">"
    };
    return encodedString.replace(translate_re, function(match, entity) {
        return translate[entity];
    }).replace(/&#(\d+);/gi, function(match, numStr) {
        var num = parseInt(numStr, 10);
        return String.fromCharCode(num);
    });
}

async function retrieveBdxMetropole() {
    const monthFrenchShortToIndex = {};
    for(let i = 0; i <= 11; i++) {
        const key = new Date(1996, i, 12).toLocaleString('fr-FR', {month: 'short'});
        monthFrenchShortToIndex[key] = i;
    };

    const reg = new RegExp(`<div class="agenda-content">.*?<p class="day">(.*?)<\/p>.*?<p class="month">(.*?)<\/p>.*?<p class="year">(.*?)<\/p>.*?<h3>.*?href="(.*?)".*?>(.*?)<.*?<p class="place">(.*?)<\/p>.*?<\/div><\/div>`, 'gm');
    const today = new Date();
    const nextSaturday = new Date();
    nextSaturday.setDate(today.getDate() + 6);
    const url = `${BDXMETROPOLE_URL}/Agenda?periode=personnaliser&debut=${today.toLocaleDateString("fr-FR", format)}&fin=${nextSaturday.toLocaleDateString("fr-FR", format)}&q=&commune=&type=&thematique=`;
    const source = (
        await (await fetch(url)).text()
    )
        .replace(/\n|\r/g, '')
        .split('<strong>Et toujours</strong>')[0];
    const events = Array.from(source.matchAll(reg))
        .map((match) => ({
            dateTime: new Date(
                Number(match[3]), 
                monthFrenchShortToIndex[match[2]], 
                Number(match[1])),
            date: `${match[1]} ${match[2]} ${match[3]}`,
            link: BDXMETROPOLE_URL + match[4].trim(),
            title: decodeEntities(match[5].trim()),
            place: decodeEntities(match[6].trim()),
        }))
    return events;
};

async function retrieveMobilizon() {
    const today = new Date();
    const nextSaturday = new Date();
    nextSaturday.setDate(today.getDate() + 6);
    const query = {
        "query": "{searchEvents(location:\"ezzx5529g\",radius:100){elements{title,physicalAddress{locality},url,beginsOn}}}",
    };

    const request = await fetch('https://mobilizon.fr/api', {
        method: "POST",
        body: JSON.stringify(query),
        headers: {
            "Content-Type": "application/json",
        }
    });

    const json = await request.json();
    const events = json.data.searchEvents.elements
        .filter((e) => {
            const date = new Date(e.beginsOn);
            return date >= today && date <= nextSaturday;
        })
        .map((e) => ({
            dateTime: new Date(e.beginsOn),
            date: new Date(e.beginsOn).toLocaleDateString('fr-FR', {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }),
            link: e.url,
            title: e.title,
            place: e.physicalAddress?.locality,
        }));

    return events;
}

async function getToken() {
    const request = await fetch(INSTANCE + "/oauth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json;charset=utf-8",
        },
        body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: config.client_id,
            client_secret: config.client_secret,
            redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
            scope: "write",
            code: config.authorizationCode
        })
    });
    if(!request.ok) throw new Error(request);
    const json = await request.json();
    return json.access_token;
}

async function publish(events) {
    const today = new Date();
    const nextSaturday = new Date();
    nextSaturday.setDate(today.getDate() + 6);
    const text = `
        Aujourd'hui et la semaine à venir (${today.toLocaleDateString("fr-FR", format)} - ${nextSaturday.toLocaleDateString("fr-FR", format)}) à Bordeaux:  \n
${events.map((e) => (
    `* Le ${e.date}: [${e.title} (${e.place})](${e.link})`
)).join('\n')}
    `;
    const request = await fetch(INSTANCE + "/api/v1/statuses", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${await getToken()}`,
            "Content-Type": "application/json;charset=utf-8",
        },
        body: JSON.stringify({
            "status": text,
            "in_reply_to_id":null,
            "media_ids":[],
            "sensitive":false,
            "spoiler_text":"",
            "visibility":"public",
            "content_type":"text/markdown",
            "poll":null,
            "scheduled_at":null
        })
    });
    if(request.status !== 200) {
        throw new Error(JSON.stringify(request));
    }
}

(async () => {
    try {
        const events = [
            ...(await retrieveBdxMetropole()),
            ...(await retrieveMobilizon()),
        ].sort((a, b) => a.dateTime - b.dateTime);
        await publish(events);
    } catch (e) {
        console.error(e);
        exit(1);
    }     
})();