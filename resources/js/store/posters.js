import Api from '@/services/api';
import { defineStore } from 'pinia';

export const usePostersStore = defineStore('posters', {
    state: () => ({
        loading: true,
        loadingMessage: 'Loading Posters ...',
        moviePosters: [],
        moviesQueue: [],
        isConnected: false,
        baseUrl: '',
        plexToken: '',
        settings: {
            poster_display_speed: 15000,
            transition_type: 'fade',
        },
        nowPlayingPoster: '',
        recentlyAddedInterval: null,
        nowPlayingInterval: null,
        transitionImagesInterval: null,
        contentRating: '',
        mpaaRating: '',
        rating: 0,
        audienceRating: 0,
        currentImage: 0,
        borderWidth: 2,
        starPadding: 2,
        controller: '',
        iframeEl: '',
        audio: null,
        runtime: 0,
        nowPlayingRuntime: 0,
        theme_music: null,
        nowPlaying: false,
        videoPlaying: false,
        show_dolby_atmos_vertical: false,
        show_dolby_vision_vertical: false,
        show_dts: false,
        show_auro_3d: false,
        show_imax: false,
        show_dolby_51: false,
        socket: '',
    }),
    getters: {},
    actions: {
        boot() {
            axios
                .get('/api/settings')
                .then((response) => {
                    this.settings = response.data;
                    if (this.settings.plex_service) {
                        this.startSockets();
                        localStorage.setItem('plexIpAddress', this.settings.plex_ip_address);
                        localStorage.setItem('plexToken', this.settings.plex_token);
                    }
                    this.getMoviePosters();
                    this.recentlyAddedInterval = setInterval(() => {
                        this.cachePosters();
                    }, 60000 * 60 * 60 * 1000 * 4); // Every 4 hours
                    this.controlTV('on');
                })
                .catch((e) => {
                    console.log(e.message);
                });
        },
        getMoviePosters() {
            this.stopTransitionImages();
            axios
                .get('/api/posters?show_in_rotation=true')
                .then((response) => {
                    this.moviePosters = response.data.posters;
                    let poster = '';
                    if (this.moviePosters.length === 0) {
                        this.loadingMessage =
                            'You do not have any posters loaded yet. Open this application in a browser and click here to manage your poster library.';
                    } else {
                        if (this.settings.random_order) {
                            poster = this.getRandomPoster();
                        } else {
                            poster = this.moviePosters[0];
                        }

                        poster.show = true;

                        this.handlePosterView(poster);

                        setTimeout(() => {
                            this.loading = false;
                            this.loadingMessage = 'Loading Posters ...';
                            this.startTransitionImages();
                        }, 12000);
                    }
                })
                .catch((e) => {
                    console.log(e.message);
                });
        },
        handlePosterView(poster) {
            this.mpaaRating = poster.mpaa_rating;
            if (poster.audience_rating) {
                this.audienceRating = poster.audience_rating / 2;
            }
            if (poster.trailer_path && poster.show_trailer) {
                if (typeof this.videoPlayer !== 'undefined') {
                    this.playTrailer(poster.trailer_path);
                }
            }
            if (poster.show_runtime) {
                this.runtime = poster.runtime;
            }
            if (
                poster.play_theme_music &&
                poster.theme_music_path &&
                this.settings.play_theme_music
            ) {
                this.theme_music = poster.theme_music_path;
                this.playMusic();
            }

            if (!this.settings.use_global_prologos) {
                if (this.settings.use_global_prologos_if_no_poster_prologos) {
                    if (
                        !poster.show_dolby_atmos &&
                        !poster.show_dolby_vision &&
                        !poster.show_dtsx &&
                        !poster.show_auro_3d &&
                        !poster.show_imax &&
                        !poster.show_dolby_51
                    ) {
                        this.useSettingsProLogos();
                    } else {
                        this.usePosterProLogos(poster);
                    }
                } else {
                    this.usePosterProLogos(poster);
                }
            } else {
                this.useSettingsProLogos();
            }
        },
        getNowPlaying() {
            Api.apiCallPlex('/status/sessions/')
                .then((response) => {
                    const size = response.data.MediaContainer.size;
                    if (size > 0) {
                        this.nowPlayingPoster =
                            'http://' +
                            this.settings.plex_ip_address +
                            ':32400' +
                            response.data.MediaContainer.Metadata[0].thumb +
                            '?X-Plex-Token=' +
                            this.settings.plex_token;

                        let data = response.data.MediaContainer.Metadata[0];
                        this.contentRating = data.contentRating;

                        if (data.audienceRating) {
                            this.rating = data.audienceRating / 2;
                        }

                        if (data.duration && this.settings.show_runtime) {
                            this.nowPlayingRuntime = data.duration / 1000 / 60;
                        }
                    }
                })
                .catch((e) => {
                    console.log(e.message);
                });
        },
        usePosterProLogos(poster) {
            this.show_dolby_atmos_vertical = poster.show_dolby_atmos;
            this.show_dolby_vision_vertical = poster.show_dolby_vision;
            this.show_dts = poster.show_dtsx;
            this.show_auro_3d = poster.show_auro_3d;
            this.show_imax = poster.show_imax;
            this.show_dolby_51 = poster.show_dolby_51;
        },
        useSettingsProLogos() {
            this.show_dolby_atmos_vertical = this.settings.show_dolby_atmos_vertical;
            this.show_dolby_vision_vertical = this.settings.show_dolby_vision_vertical;
            this.show_dts = this.settings.show_dts;
            this.show_auro_3d = this.settings.show_auro_3d;
            this.show_imax = this.settings.show_imax;
            this.show_dolby_51 = this.settings.show_dolby_51;
        },
        getInSequencePoster() {
            const len = this.moviePosters.length;
            const currIndex = this.moviePosters.findIndex((poster) => poster.show === true);
            let activeIndex = 0;
            if (this.settings.random_order) {
                activeIndex = Math.floor(Math.random() * len);
            } else {
                activeIndex = currIndex + 1 === len ? 0 : currIndex + 1;
            }

            let poster = this.moviePosters[activeIndex];
            let pastPoster = this.moviePosters[currIndex];

            poster.show = true;
            pastPoster.show = false;

            return poster;
        },
        transitionImages() {
            let poster = '';
            if (this.videoPlayer) {
                this.videoPlayer.innerHTML = '';
            }
            this.stopMusic();

            if (this.moviePosters.length > 0) {
                poster = this.getInSequencePoster();
                this.handlePosterView(poster);
            }
        },
        cachePosters() {
            axios
                .get('/api/cache-posters')
                .then((response) => {
                    this.moviePosters = response.data.posters;
                    setTimeout(() => {
                        if (this.loading === true) {
                            this.loading = false;
                            this.startTransitionImages();
                        }
                    }, 5000);
                })
                .catch((e) => {
                    console.log(e.message);
                });
        },
        playMusic() {
            setTimeout(() => {
                window.audio = new Audio('/storage/music/' + this.theme_music);
                window.audio.play();
            }, 1500);
        },
        stopMusic() {
            if (window.audio) {
                let vol = 1;
                let interval = 40;
                if (window.audio.volume == 1) {
                    var intervalID = setInterval(() => {
                        if (vol > 0) {
                            vol -= 0.05;
                            window.audio.volume = vol.toFixed(2);
                        } else {
                            clearInterval(intervalID);
                            window.audio.pause();
                            window.audio = null;
                        }
                    }, interval);
                }
            }
        },
        playTrailer(youTubeId) {
            this.iframeEl = document.createElement('iframe');
            this.iframeEl.setAttribute(
                'src',
                `https://www.youtube.com/embed/${youTubeId}?enablejsapi=1&autoplay=1&mute=1&autohide=2&modestbranding=1&showinfo=0&controls=0&rel=0&border=0&wmode=opaque`
            );
            this.iframeEl.setAttribute('frameborder', '0');
            this.iframeEl.setAttribute('allow', 'autoplay; encrypted-media;');
            this.iframeEl.addEventListener('load', this.playVideo);
            this.videoPlayer.appendChild(this.iframeEl);
            this.iframeEl.focus();
        },
        playVideo(e) {
            this.videoPlaying = true;
            this.iframeEl.contentWindow.postMessage(
                '{"event":"command","func":"playVideo","args":""}',
                '*'
            );
        },
        updateSetting(poster, column, value) {
            const params = {
                _method: 'put',
                value: value,
            };
            axios
                .post('/api/posters/' + poster.id + '/' + column, params)
                .then((response) => {})
                .catch((e) => {});
        },
        startSockets() {
            const socket = new WebSocket(
                'ws://' +
                    this.settings.plex_ip_address +
                    ':32400/:/websockets/notifications' +
                    '?X-Plex-Token=' +
                    this.settings.plex_token
            );

            socket.addEventListener('open', () => {});

            socket.addEventListener('message', (event) => {
                const data = JSON.parse(event.data);
                const action = data.NotificationContainer.type;
                if (action === 'playing') {
                    const state = data.NotificationContainer.PlaySessionStateNotification[0].state;
                    this.controlPlayerState(state);
                }
            });
        },
        controlPlayerState(state) {
            switch (state) {
                case 'playing':
                    this.nowPlaying = true;
                    break;
                case 'paused':
                case 'stopped':
                    this.nowPlaying = false;
                    break;
            }
        },
        controlTV(command) {
            if (this.settings.use_cec_power) {
                if (!this.isOnTime()) {
                    if (command === 'on') {
                        command = 'standby';
                    }
                }
                axios
                    .get('/api/control-display/' + command)
                    .then((response) => {
                        console.log(response.data);
                    })
                    .catch((e) => {
                        console.log(e.message);
                    });
            }
        },
        isOnTime() {
            let presentDate = new Date();
            presentDate = this.changeTimezone(presentDate, 'America/New_York');
            let date = new Date();
            date = this.changeTimezone(date, 'America/New_York');
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const year = date.getFullYear();
            const date1 = new Date(
                month + '/' + day + '/' + year + ' ' + this.settings.start_power_time
            );
            const date2 = new Date(
                month + '/' + day + '/' + year + ' ' + this.settings.end_power_time
            );

            if (
                presentDate.getTime() > date1.getTime() &&
                presentDate.getTime() < date2.getTime()
            ) {
                return true;
            } else {
                return false;
            }
        },
        changeTimezone(date, ianatz) {
            var invdate = new Date(
                date.toLocaleString('en-US', {
                    timeZone: ianatz,
                })
            );
            var diff = date.getTime() - invdate.getTime();
            return new Date(date.getTime() - diff);
        },

        startTransitionImages() {
            window.transitionImagesInterval = setInterval(() => {
                this.transitionImages();
            }, this.settings.poster_display_speed);
        },
        stopTransitionImages() {
            clearInterval(window.transitionImagesInterval);
        },
        reload() {
            this.loadingMessage = 'Re-loading Posters ...';
            this.loading = true;
            this.stopTransitionImages();
            clearInterval(this.recentlyAddedInterval);
            this.stopMusic();
            this.videoPlaying = false;
            this.boot();
        },
        setLoading(value) {
            this.loading = value;
        },
        setSocket() {
            this.socket = io('http://' + import.meta.env.VITE_BASE_URL + ':3000');
            this.socket.on('receive:command', (data) => {
                switch (data.command) {
                    case 'reload':
                        this.reload();
                        break;
                }
            });
        },
        setNowPlayingPoster(data) {
            this.nowPlayingPoster = data;
        },
        setVideoPlayerRef(data) {
            this.videoPlayer = data;
        },
    },
});
