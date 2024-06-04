const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
} = require("@discordjs/voice");
const play = require("play-dl");
const sodium = require("libsodium-wrappers");
require("dotenv").config();

let connection;
let audioPlayer;
let messageId;

const commands = [
  {
    name: "!help",
    description: "Displays all commands!",
  },
  {
    name: "!play",
    description: "Plays given playlist!",
  },
  {
    name: "!p",
    description: "Temp!",
  },
  {
    name: "!next",
    description: "Skips current song!",
  },
  {
    name: "!stop",
    description: "STOP!",
  },
];

async function playPlaylist(playlistUrl, message) {
  await sodium.ready;

  let voiceChannel = message.member.voice.channel;
  if (!voiceChannel) {
    return message.reply("You need to be in a voice channel to play music!");
  }

  connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: message.guild.id,
    adapterCreator: message.guild.voiceAdapterCreator,
  });

  try {
    let playlist = await play.playlist_info(playlistUrl, { incomplete: true });
    audioPlayer = createAudioPlayer();

    for (let video of playlist.videos) {
      let stream = await play.stream(video.url);
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });

      audioPlayer.play(resource);

      const nowPlayingMessage = await message.channel.send(
        `playing: **${video.title}** | 00:00`
      );

      connection.subscribe(audioPlayer);

      const interval = setInterval(() => {
        nowPlayingMessage.edit(
          `playing: **${video.title}** | ${formatTime(
            audioPlayer.state.playbackDuration
          )}`
        );
      }, 1000);

      await new Promise((resolve) => {
        audioPlayer.once("idle", () => {
          clearInterval(interval);
          resolve();
        });
      });
    }

    stopPlaying();
  } catch (error) {
    console.error(error);
    message.channel.reply("There was an error trying to play the playlist!");
  }
}

async function stopPlaying() {
  if (connection && audioPlayer) {
    connection.disconnect();
  }
}

async function next() {
  if (connection && audioPlayer) {
    audioPlayer.stop();
  }
}

function help(message) {
  message.reply("Help");
  console.log("Help");
}

function formatTime(milliseconds) {
  var seconds = Math.floor(milliseconds / 1000);
  var minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  return ("0" + minutes).slice(-2) + ":" + ("0" + seconds).slice(-2);
}

async function processCommand(command, args, message) {
  switch (command) {
    case "!help":
      help(message);
      break;

    case "!play":
      if (args.length < 2) {
        return message.reply("You need to provide a YouTube playlist URL!");
      }

      const playlistUrl = args[1];
      await playPlaylist(playlistUrl, message);
      break;

    //TEMP
    case "!p":
      await playPlaylist(
        "Already defined url so i dont have to type it every time",
        message
      );
      break;

    case "!stop":
      stopPlaying();
      break;

    case "!next":
      next();
      break;

    default:
      break;
  }
}

(async () => {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const TOKEN = process.env.TOKEN;

  client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
  });

  client.on("messageCreate", async (message) => {
    const args = message.content.split(" ");
    const command = args[0];

    await processCommand(command, args, message);
  });

  client.login(TOKEN);
})();
