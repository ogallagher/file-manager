import logging
import sys
import os
from datetime import datetime

logger = logging.getLogger('logs')

def level_to_name(level: int):
    return logging._levelToName[level]
# end def

def name_to_level(name: str) -> int:
    return logging._nameToLevel[name.strip().upper()]

def init_logging(logs_dir: str = None):
    formatter = logging.Formatter(
        fmt='{name}.{levelname} @{filename}:{lineno}\t{message}',
        style='{'
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    logging.root.addHandler(handler)

    if logs_dir is not None:
        logger.debug(f'write logs to new file in {logs_dir}')

        os.makedirs(
            logs_dir,
            exist_ok=True
        )

        now = datetime.now()
        file_handler = logging.FileHandler(
            filename=os.path.join(logs_dir, now.strftime('%Y-%m-%dT%H-%M-%S.txt')),
            encoding='utf-8'
        )
        file_handler.setFormatter(formatter)

        logging.root.addHandler(file_handler)
    # end if file logs
    else:
        logger.info('logs file disabled')
# end def
