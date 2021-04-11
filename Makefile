build:
	rm -rf lib/ dist/
	npm pack
	rm -f lift-*.tgz
	rm -f lib/*.d.ts
	rm -f lib/*/*.d.ts
	npm ci --only=prod
	pkg . --out-path dist --targets node10-macos-x64
	npm ci
	rm -f /usr/local/bin/lift
	cp dist/lift /usr/local/bin/lift
	aws s3 cp dist/lift s3://lift-releases/$$(jq '.version' package.json --raw-output)/lift
	aws s3 cp s3://lift-releases/$$(jq '.version' package.json --raw-output)/lift s3://lift-releases/latest/lift

availability-zones:
	cd utils && node availability-zone-list.js

plugin:
	npx etsc
