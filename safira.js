const Discord = require("discord.js");
const fs = require("fs");
const ytdl = require("ytdl-core");
const request = require("request");

const YT_KEY = "YT API KEY HERE";

const bot = new Discord.Client({
    autoReconnect: true,
    max_message_cache: 0
});

console.log("[INFO] Initializing bot...");

bot.on('ready', () => {
    console.log("[INFO] Bot initialized!");
    bot.user.setGame("https://pedr0ni.github.io");
});

bot.login("DISCORD API KEY HERE");

bot.on('message', (message) => {
    var message_text = message.content;
	if(message_text[0] == '$') { //Command issued
		handleCommand(message, message_text.substring(1));
    }
});

var queue = [];

let text_channel = null;
var voice_connection = null;
var voice_handler = null;
var now_playing = null;

let RED = 15158332;
let BLUE = 3447003;
let GREEN = 3066993;
let YELLOW = 15844367;

function makeEmbed(color, title, description) {
    return {embed: {
        color: color,
        title: title,
        description: description
    }};
}

String.prototype.replaceAt=function(index, replacement) {
    return this.substr(0, index) + replacement+ this.substr(index + replacement.length);
}

let commands = [
    {
        command: 'play',
        help: 'Adiciona uma música para tocar.',
        aliases: [],
        execute: function(message, args) {

            if (message.member.voiceChannel == null) {
                message.channel.send(makeEmbed(RED, ":x:", "Você não está em um canal de voz para tocar músicas."));
                return;
            }

            var regExp = /^.*(youtu.be\/|list=)([^#\&\?]*).*/;
            var match = args[1].match(regExp);

            if (args[1].toLowerCase().indexOf("http") == -1 && args[1].toLowerCase().indexOf("://") == -1) {
                var query = "";
                for (var i = 1; i < args.length; i++) {
                    query += args[i] + " ";
                }
                query = query.substring(0, query.length - 1);
                message.channel.send(makeEmbed(YELLOW, ":question:", "Procurando por " + query));

                request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=" + encodeURIComponent(query) + "&key=" + YT_KEY, (error, response, body) => {
                    var json = JSON.parse(body);
                    if("error" in json) {
                        message.channel.send(makeEmbed(RED, ":x: Ocorreu um erro", json.error.errors[0].message + " - " + json.error.errors[0].reason));
                    } else if(json.items.length === 0) {
                        message.channel.send(makeEmbed(RED, ":video_camera:", "Nenhum vídeo foi encontrado."));
                    } else {
                        addQueue(json.items[0].id.videoId, message);
                    }
                });
                return;
            }

            if (match && match[2]){
                queuePlaylist(match[2], message);
            } else {
                addQueue(args[1], message);
            }
        }
    },
    {
        command: 'help',
        help: 'Mostra todos os comandos',
        aliases: ['commands'],
        execute: function(message, args) {
			message.reply("Works!");
		}
    },
    {
        command: 'stop',
        help: 'Para a musica, limpa a lista e remove a Safira do canal de voz.',
        aliases: ['dc'],
        execute: function(message, args) {
            if (voice_handler == null) {
                message.channel.send(makeEmbed(RED, ":x:", "Não estou tocando nenhuma música no momento."));
                return;
            }
            voice_handler.end("manual");
            voice_handler = null;
            voice_connection.channel.leave();
            voice_connection = null;
            queue = [];
            message.channel.send(makeEmbed(YELLOW, ":octagonal_sign:", "Parando de tocar, saindo do canal de voz e limpado a fila de espera."));
        }
    },
    {
        command: 'queue',
        help: 'Mostra a lista de músicas para tocar.',
        aliases: ['q'],
        execute: function(message, args) {
            if (queue.length == 0) {
                message.channel.sendMessage(makeEmbed(RED, ":x:" , "A lista de espera não possui nenhuma música."));
                return;
            }
            var reply = "`" + queue.length + "` Músicas : \n \n";
            for (var i = 0 ; i < queue.length; i++) {
                reply += "["+i+"] - " + queue[i]['title'] + "\n";
            }

            message.channel.sendMessage(makeEmbed(YELLOW, ":cd: Lista de Músicas", reply));
        }
    },
    {
        command: 'skip',
        help: 'Pula a música que está tocando.',
        aliases: [],
        execute: function(message, args) {
            if (voice_handler == null) {
                message.channel.send(makeEmbed(RED, ":x:", "Não estou tocando nenhuma música no momento."));
                return;
            }
            if (queue.length == 0) {
                message.channel.send(makeEmbed(RED, ":x:", "Não tem mais nenhuma música na fila de espera."));
                return;
            }
            message.channel.send(makeEmbed(BLUE, ":musical_note:", "Pulando música !"));
            playQueue(message);
        }
    },
    {
        command: 'np',
        help: 'Mostra as informações da música tocando no momento.',
        aliases: [],
        execute: function(message, args) {
            if (voice_handler == null) {
                message.channel.send(makeEmbed(RED, ":x:", "Não estou tocando nenhuma música no momento."));
                return;
            }
            var square = "🔘";
            var line = "▬▬▬▬▬▬▬▬▬▬";
            var percent = Math.round(((voice_handler.time / (now_playing['total'] * 1000)) *  100) / 10);
            line = line.replaceAt(percent, square);
            message.channel.send(makeEmbed(YELLOW, ":cd: " + now_playing['title'], " \n " + toTime(voice_handler.time) + "/" + toTime(now_playing['total'] * 1000) + "\n \n" + line));
        }
    },
    {
        command: 'lyrics',
        help: 'Mostra legendas para a música que está tocando no momento',
        aliases: [],
        execute: function(message, args) {
            
            var title = now_playing['title'];
            var autor = title.substring(0, title.indexOf("-"));
            autor = autor.substring(0, autor.lastIndexOf(" "));
            var musica = null;
            if (title.indexOf("[") != -1) {
                musica = title.substring(title.indexOf("-") + 2, title.indexOf("["));
            } else if (title.indexOf("(") != -1) {
                musica = title.substring(title.indexOf("-") + 2, title.indexOf("("));
            }  else {
                musica = title.substring(title.indexOf("-") + 2, title.length);
            }
            musica = musica.substring(0, musica.lastIndexOf(" "));
            
            var url = "https://lyric-api.herokuapp.com/api/find/"+encodeURIComponent(autor)+"/"+encodeURIComponent(musica);
            console.log(url);
            request(url, (error, response, body) => {
                if (body.indexOf("Cannot") != -1) {
                    message.channel.send(makeEmbed(RED, ":x:", "Lyric não encontrada."));
                    return;
                }
                var json = JSON.parse(body);
                if ("err" in json && json.err != "none") {
                    message.channel.send(makeEmbed(RED, ":x:", "Lyric não encontrada."));
                } else {
                    message.channel.send(makeEmbed(GREEN, ":cd: " + title, json.lyric.substring(0, 2047)));
                }
            });
        }
    }
];

function toTime( ms ) {
    var seconds = ms / 1000;
    var hours = parseInt( seconds / 3600 );
    seconds = seconds % 3600; 
    var minutes = parseInt( seconds / 60 ); 
    seconds = seconds % 60;
    return Math.round(minutes) + ":" + Math.round(seconds);
}

function addQueue(video, message, mute = false) {
    var video_id = getVideoId(video);

    ytdl.getInfo("https://www.youtube.com/watch?v=" + video_id, (error, info) => {

        if (error) {
            message.channel.send(makeEmbed(RED, ":x:", "O vídeo " + video_id + " não foi encontrado ou não pode ser reproduzido."));
            console.log(error);
            return;
        }

        queue.push({
            title: info['title'],
            id: video_id,
            user: message.author.username,
            total: info.length_seconds
        });

        if (!mute)
            message.channel.send(makeEmbed(GREEN, ":musical_note: " + info['title'], "Adicionado na fila por " + message.author.username));
        
        if (voice_handler == null)
            playQueue(message);
    });
}

function queuePlaylist(playlistId, message, pageToken = '') {
    request("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=" + playlistId + "&key=" + YT_KEY + "&pageToken=" + pageToken, (error, response, body) => {
		var json = JSON.parse(body);
		if ("error" in json) {
			message.channel.send(makeEmbed(RED, ":x: Ocorreu um erro", json.error.errors[0].message + " - " + json.error.errors[0].reason));
		} else if (json.items.length === 0) {
			message.channel.send(makeEmbed(RED, ":x:", "Nenhum vídeo foi encontrado na playlist."));
		} else {
            var total = 0;
			for (var i = 0; i < json.items.length; i++) {
                addQueue(json.items[i].snippet.resourceId.videoId, message, true);
                total++;
            }
            message.channel.send(makeEmbed(GREEN, ":cd:", "Adicionado `"+total+"` músicas na fila."));
			if (json.nextPageToken == null){
				return;
			}
			queuePlaylist(playlistId, message, json.nextPageToken);
		}
	});
}

function playQueue(message) {

    if (queue.length == 0) {
        return;
    }

    if (voice_connection == null) {
        var voice_channel = message.member.voiceChannel;
        voice_channel.join().then(connection => {
            voice_connection = connection;
            startAudioStream(message);
        });

        return;
    }

    startAudioStream(message);

}

function startAudioStream(message) {
    if (voice_handler != null) {
        voice_handler.end("manual");
        voice_handler = null;
    }
    var audio_stream = ytdl("https://www.youtube.com/watch?v="+queue[0]['id']);
    voice_handler = voice_connection.playStream(audio_stream);

    now_playing = {
        title: queue[0]['title'],
        id: queue[0]['id'],
        user: queue[0]['user'],
        total: queue[0]['total']
        
    };

    voice_handler.once('end', reason => {
        if (reason == "manual")  {
            voice_handler = null;
            now_playing = null;
            return;
        }
        voice_handler = null;
        now_playing = null;
        setTimeout(() => {
            if (voice_handler == null && voice_connection != null) {
                voice_connection.channel.leave();
                voice_connection = null;
            }
        }, 1000 * 60 * 5);
        playQueue(message);
    });

    queue.splice(0, 1);
}

function getVideoId(string) {
	var regex = /(?:\?v=|&v=|youtu\.be\/)(.*?)(?:\?|&|$)/;
	var matches = string.match(regex);

	if(matches) {
		return matches[1];
	} else {
		return string;
	}
}

function getCommand(cmd) {
    for (var i = 0; i < commands.length; i++) {
        if (commands[i].command.toLowerCase() == cmd.toLowerCase()) {
            return commands[i];
        }
    }

    return null;
}

function handleCommand(message, text) {
	var params = text.split(" ");
	var command = getCommand(params[0]);

	if (command != null) {
		command.execute(message, params);
	}
}

