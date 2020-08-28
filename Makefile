build:
	rm -rf lib/ dist/
	npm pack
	rm shift-*.tgz
	rm lib/*.d.ts
	rm lib/*/*.d.ts
	npm ci --only=prod
	pkg . --out-path dist --targets node10-macos-x64
	npm ci
