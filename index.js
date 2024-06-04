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
let shuffleMode = false;
let videos;
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
    description: "Stops the music!",
  },
  {
    name: "!shuffle",
    description: "Toggles shuffle mode!",
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

    videos = playlist.videos;
    if (shuffleMode) {
      videos = shuffleArray(videos);
    }

    let currentVideoIndex = 0;

    const playNextVideo = async () => {
      if (currentVideoIndex >= videos.length) {
        stopPlaying();
        return;
      }

      const video = videos[currentVideoIndex];
      currentVideoIndex++;

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

      audioPlayer.once("idle", () => {
        clearInterval(interval);
        playNextVideo();
      });
    };

    playNextVideo();
  } catch (error) {
    console.error(error);
    message.channel.reply("There was an error trying to play the playlist!");
  }
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function stopPlaying() {
  if (connection && audioPlayer) {
    connection.disconnect();
    audioPlayer.stop();
  }
}

async function next() {
  if (connection && audioPlayer) {
    if (shuffleMode) {
      videos = shuffleArray(videos);
    }
    audioPlayer.stop();
  }
}

function toggleShuffle(message) {
  shuffleMode = !shuffleMode;
  message.reply(`Shuffle mode is now ${shuffleMode ? "enabled" : "disabled"}`);
}

function help(message) {
  const helpMessage = commands
    .map((cmd) => `\`${cmd.name}\`: ${cmd.description}`)
    .join("\n");
  message.reply(helpMessage);
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

    case "!p":
      await playPlaylist(
        //.env variable lol
        process.env.defined_url,
        message
      );
      break;

    case "!stop":
      stopPlaying();
      break;

    case "!next":
      next();
      break;

    case "!shuffle":
      toggleShuffle(message);
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
