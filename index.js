const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
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
    description: "Plays the given playlist or video!",
  },
  {
    name: "!p",
    description: "Plays a predefined playlist!",
  },
  {
    name: "!pause",
    description: "Pauses the music for a specified time!",
  },
  {
    name: "!unpause",
    description: "Resumes the paused music!",
  },
  {
    name: "!next",
    description: "Skips the current song!",
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
    if (!playlistUrl.includes("playlist")) {
      console.log("Not a playlist");
      audioPlayer = createAudioPlayer();
      let stream = await play.stream(playlistUrl);
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });
      audioPlayer.play(resource);
      connection.subscribe(audioPlayer);

      const videoInfo = await play.video_basic_info(playlistUrl);
      const video = videoInfo.video_details;

      const musicEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Now Playing: **${video.title}**`)
        .setAuthor({
          name: "Music Bot",
          iconURL:
            "https://raw.githubusercontent.com/codetheweb/aoede/main/.github/logo.png",
        })
        .setDescription(`00:00 / ${video.durationRaw}`)
        .setImage(`${video.thumbnails[3].url}`)
        .setTimestamp()
        .setFooter({
          text: "Some footer text here",
        });

      const nowPlayingMessage = await message.channel.send({
        embeds: [musicEmbed],
      });

      const interval = setInterval(() => {
        const updatedEmbed = EmbedBuilder.from(musicEmbed).setDescription(
          `${formatTime(audioPlayer.state.playbackDuration)} / ${
            video.durationRaw
          }`
        );
        nowPlayingMessage.edit({ embeds: [updatedEmbed] });
      }, 1000);

      audioPlayer.once("idle", () => {
        clearInterval(interval);
        stopPlaying();
      });

      return;
    }

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

      const musicEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Now Playing: **${video.title}**`)
        .setAuthor({
          name: "Music Bot",
          iconURL:
            "https://raw.githubusercontent.com/codetheweb/aoede/main/.github/logo.png",
        })
        .setDescription(`00:00 / ${video.durationRaw}`)
        .setImage(`${video.thumbnails[3].url}`)
        .setTimestamp()
        .setFooter({
          text: "Some footer text here",
        });

      const nowPlayingMessage = await message.channel.send({
        embeds: [musicEmbed],
      });

      connection.subscribe(audioPlayer);

      const interval = setInterval(() => {
        const updatedEmbed = EmbedBuilder.from(musicEmbed).setDescription(
          `${formatTime(audioPlayer.state.playbackDuration)} / ${
            video.durationRaw
          }`
        );
        nowPlayingMessage.edit({ embeds: [updatedEmbed] });
      }, 1000);

      audioPlayer.once("idle", () => {
        clearInterval(interval);
        playNextVideo();
      });
    };

    playNextVideo();
  } catch (error) {
    console.error(error);
    message.reply("There was an error trying to play the playlist or video!");
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

async function pause(timeout) {
  if (audioPlayer) {
    audioPlayer.pause();
    if (timeout) {
      setTimeout(() => unpause(), timeout * 1000);
    }
  }
}

async function unpause() {
  if (audioPlayer) {
    audioPlayer.unpause();
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
  const helpEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Help Menu")
    .setAuthor({
      name: "Music Bot",
      iconURL:
        "https://raw.githubusercontent.com/codetheweb/aoede/main/.github/logo.png",
    })
    .addFields(
      commands.map((cmd) => ({
        name: cmd.name,
        value: cmd.description,
        inline: false,
      }))
    )
    .setTimestamp()
    .setFooter({
      text: "Some footer text here",
    });

  message.channel.send({ embeds: [helpEmbed] });
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
        return message.reply("You need to provide a YouTube URL!");
      }
      const playlistUrl = args[1];
      await playPlaylist(playlistUrl, message);
      break;
    case "!p":
      await playPlaylist(process.env.defined_url, message);
      break;
    case "!pause":
      pause(args[1]);
      break;
    case "!unpause":
      unpause();
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
