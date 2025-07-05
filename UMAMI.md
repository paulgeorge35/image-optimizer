title: Umami API Authenticationdescription: Guide to authenticating with the self-hosted Umami API

Authentication

Note: The following authentication method is only for self-hosted Umami. For Umami Cloud, simply generate an API key.

POST /api/auth/login⁠

To make API requests, you must first obtain a token. Send a POST⁠ request to the /api/auth/login⁠ endpoint with your credentials:{
"username": "your-username",
"password": "your-password"
}

If successful, you will receive a response similar to:{
"token": "eyTMjU2IiwiY...4Q0JDLUhWxnIjoiUE_A",
"user": {
"id": "cd33a605-d785-42a1-9365-d6cad3b7befd",
"username": "your-username",
"createdAt": "2020-04-20 01:00:00"
}
}

Save the token⁠ value and include it in the Authorization⁠ header for all subsequent requests requiring authentication. The header should look like:Authorization: Bearer eyTMjU2IiwiY...4Q0JDLUhWxnIjoiUE_A

Example using curl⁠curl https://{yourserver}/api/websites \
 -H "Accept: application/json" \
 -H "Authorization: Bearer &lt;token&gt;"

The authorization token must be included with every API call that requires permissions.

POST /api/auth/verify⁠

You can verify if your token is still valid by making a request to this endpoint.

Sample response:{
"id": "1a457e1a-121a-11ee-be56-0242ac120002",
"username": "umami",
"role": "admin",
"isAdmin": true
}
Sending stats

POST /api/send

To register an event⁠, send a POST⁠ request to /api/send⁠ with the following data:

For Umami Cloud, use https://cloud.umami.is/api/send⁠.

Parameters

payload
• hostname⁠: (string) Name of host.
• language⁠: (string) Language of visitor (e.g., “en-US”)
• referrer⁠: (string) Referrer URL.
• screen⁠: (string) Screen resolution (e.g., “1920x1080”)
• title⁠: (string) Page title.
• url⁠: (string) Page URL.
• website⁠: (string) Website ID.
• name⁠: (string) Name of the event.
• data⁠: (object, optional) Additional data for the event.

type: (string) event⁠ is currently the only type available.

Sample payload{
"payload": {
"hostname": "your-hostname",
"language": "en-US",
"referrer": "",
"screen": "1920x1080",
"title": "dashboard",
"url": "/",
"website": "your-website-id",
"name": "event-name",
"data": {
"foo": "bar"
}
},
"type": "event"
}

Note: For /api/send⁠ requests, you do not need to send an authentication token.

Also, you must send a proper User-Agent⁠ HTTP header or your request will not be registered.

Generating values programmatically

You can generate most of these values programmatically in JavaScript using browser APIs. For example:const data = {
payload: {
hostname: window.location.hostname,
language: navigator.language,
referrer: document.referrer,
screen: `${window.screen.width}x${window.screen.height}`,
title: document.title,
url: window.location.pathname,
website: 'your-website-id',
name: 'event-name',
},
type: 'event',
};
