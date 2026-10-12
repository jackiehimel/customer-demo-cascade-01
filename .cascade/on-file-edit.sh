#!/usr/bin/env bash
case "$1" in *.ts|*.tsx) npx eslint "$1" ;; esac
