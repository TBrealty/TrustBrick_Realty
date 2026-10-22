#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 EC2 server for Trustbrick (deploy/README.md, step 4).
# Run as the ubuntu user:  bash deploy/server-setup.sh
set -euo pipefail

echo "▸ Updating the system"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git ufw unattended-upgrades fail2ban

echo "▸ Installing Docker"
if ! command -v docker >/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi
# Keep container logs from filling the disk.
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }' | sudo tee /etc/docker/daemon.json >/dev/null
sudo systemctl restart docker

echo "▸ Adding 4 GB of swap (building the site needs more memory than a small server has)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf >/dev/null
  sudo sysctl -p /etc/sysctl.d/99-swappiness.conf
fi

echo "▸ Firewall: SSH, HTTP and HTTPS only"
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable

echo "▸ Security updates install themselves"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "✓ Server ready. Log out and back in (so Docker works without sudo), then follow step 5 in deploy/README.md."
