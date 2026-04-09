import { execFile } from 'node:child_process';

export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else if (platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', '', url];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }

    execFile(cmd, args, (err) => {
      if (err) {
        console.log(`  Open ${url} in your browser to continue`);
      }
      resolve();
    });
  });
}
