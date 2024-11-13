from node:20-bookworm
# probably a bad start here as a lot of packages are large so no benefit
	# could restarting here from Debian instead

# for now only tested those but theoretically using the same software it all should work
	# .odg .pdf .mov .svg
	# new ones thanks to Debian
		# .blend

RUN apt update && apt -y upgrade
RUN apt install -y rclone # tested for DropBox
RUN apt install -y ghostscript # tested for .pdf via convert
RUN apt install -y imagemagick # tested for .jpg and .pdf
RUN apt install -y libreoffice # tested for .odp
RUN apt install -y default-jre # might be needed for soffice
#RUN apt install -y openjdk8-jre # might be needed for soffice
RUN apt install -y ffmpeg # tested for .mov
RUN apt install -y sox # tested for .wav (not even sure we use over ffmpeg though... but it's in there)
RUN apt install -y inkscape # tested for .svg

# pointless without texlive unfortunately
# RUN apk add pandoc # tested with .epub and .pmwiki (via lua filter)
# WARNING, this makes the image HUGE, from 2GB or less to 6GB, pandoc itself is fine but texlive-full is massage
# RUN apk add texlive-full # needed for pandoc

# RUN apk add chromium # untested, needed for rendering HTML
# RUN npx puppeteer browsers install chrome # not enough
# seems particularly problematic on Alpine
	# https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#running-on-alpine

RUN wget https://ftp.nluug.nl/pub/graphics/blender/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz
RUN tar -xf blender*.tar.xz
RUN ln -s /blender*/blender /usr/bin/blender
# RUN apt install -y blender # untested
	# here v 3.x whereas locally v4.x
	# Segmentation fault (core dumped)

# RUN apt install -y pipx
# RUN pipx install rmc # untested for .rm
# does not add to the path, available as /root/.local/bin/rmc

WORKDIR /usr/app
COPY ./ /usr/app
COPY ./rclone.conf /root/.config/rclone/rclone.conf
# surprising slow step ?!
RUN npm install
# for now cheating with ./node_modules already there


EXPOSE 3000

# Set up a default command
CMD [ "node","." ]

# to test faster
# docker exec -it $(docker ps | grep companion:latest | sed "s/ .*//") sh
# then copy files from the test_files directory to public/

# should keep different version, this is huge with texlive-full
# environment variable should help probe what is available vs not available
