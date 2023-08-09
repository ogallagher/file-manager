"""Bulk operations on the file system.
"""

from typing import *
import logging
import logs
from argparse import ArgumentParser
import sys
import os
import json
import re

logger = logging.getLogger('file-manager')

# file name pattern "name (\d+).<ext>" is not enough to uniquely identify a file! We need to use contents
def file_name_to_id(file_name) -> str:
    stat = os.stat(file_name)
    size = stat.st_size

    # determine part of name expected to be shared among copies of a file
    full_name, ext = os.path.splitext(file_name)
    name_parts = [
        part 
        for part in re.split(r'\s+\((\d+)\)', full_name)
        if part != ''
    ]

    return f'{name_parts[0]}_size={size}{ext}'
# end def

def find_duplicate_files(parent_dir: str, res_dir: str) -> Dict:
    prev_dir = os.getcwd()
    logger.info(f'move from {prev_dir} to {parent_dir}')
    os.chdir(os.path.expanduser(parent_dir))

    index: Dict[str, str] = {}
    """Maps file ids (unique per file prefix and size and type/extension) to names.
    """
    duplicates: List[str] = []
    for file_name in os.listdir('.'):
        file_id = file_name_to_id(file_name)

        if file_id not in index:
            index[file_id] = []
        # end new name

        index[file_id].append(file_name)

        if len(index[file_id]) > 1:
            duplicates.append(file_name + '\n')
            logger.debug(f'found duplicate {file_name} of {file_id}')
        # end if duplicate
    # end for

    index_dir = os.path.join(prev_dir, res_dir, parent_dir.replace('/', '_'))
    os.makedirs(index_dir, exist_ok=True)

    index_file = os.path.join(index_dir, 'index.json')
    with open(index_file, 'w') as f:
        json.dump(index, fp=f, indent=2)
        logger.info(f'grouped files index for {parent_dir} saved to {index_file}')
    # end with

    duplicates_dir = index_dir
    os.makedirs(duplicates_dir, exist_ok=True)

    duplicates_file = os.path.join(duplicates_dir, 'duplicates.txt')
    with open(duplicates_file, 'w') as f:
        f.writelines(duplicates)
        logger.info(f'saved {len(duplicates)} duplicate names to {duplicates_file}')
    # end with

    logger.info(f'move back from {parent_dir} to {prev_dir}')
    os.chdir(prev_dir)

    return index
# end def

def delete_duplicate_files(parent_dir: str, res_dir: str) -> str:
    duplicates_dir = os.path.join(res_dir, parent_dir.replace('/', '_'))
    duplicates_file = os.path.join(duplicates_dir, 'duplicates.txt')

    deletes = []
    with open(duplicates_file, 'r') as f:
        duplicates = [re.split(r'[\n\r]+$', line)[0] for line in f.readlines()]
        logger.info(f'deleting {len(duplicates)} listed in {duplicates_file}')

        for duplicate_name in duplicates:
            duplicate_path = os.path.join(os.path.expanduser(parent_dir), duplicate_name)
            logger.debug(f'delete duplicate file {duplicate_path}')
            os.unlink(duplicate_path)
            deletes.append(duplicate_path + '\n')
        # end for
    # end with

    logger.info(f'deleted {len(deletes)} files from {parent_dir}')

    deletes_dir = duplicates_dir
    os.makedirs(deletes_dir, exist_ok=True)

    deletes_file = os.path.join(deletes_dir, 'deletes.txt')
    with open(deletes_file, 'w') as f:
        f.writelines(deletes)
        logger.info(f'saved {len(deletes)} delete file names to {deletes_file}')
    # end with
# end def

def main(log_level_name: str, disable_log_file: bool, log_dir: str, res_dir: str, delete_duplicates: bool):
    # init logging
    logger.setLevel(logs.name_to_level(log_level_name))

    logs.init_logging(None if disable_log_file else log_dir)

    logger.debug(f'set log level to {log_level_name}[{logger.getEffectiveLevel()}]')

    image_dir = '~/Pictures/family/ruby'
    if not delete_duplicate_files:
        find_duplicate_files(image_dir, res_dir)
    else:
        delete_duplicate_files(image_dir, res_dir)
# end def

if __name__ == '__main__':
    opt_parser = ArgumentParser(
        prog='file manager',
        description='bulk operations on the file system',
        add_help=True
    )

    opt_parser.add_argument(
        '--log-level', '-l', type=str, default=logs.level_to_name(logging.DEBUG),
        help='set logging level'
    )
    opt_parser.add_argument(
        '--no-log-file', action='store_true',
        help='disable logs file'
    )
    opt_parser.add_argument(
        '--log-dir', type=str, default='logs/',
        help='custom logging directory'
    )
    opt_parser.add_argument(
        '--res-dir', type=str, default='res/',
        help='results directory'
    )
    opt_parser.add_argument(
        '--delete-duplicates', '-D', action='store_true',
        help='delete duplicates determined from previous run'
    )

    # parse args from argv, skipping program name
    opts = opt_parser.parse_args(sys.argv[1:])

    main(
        log_level_name=getattr(opts, 'log_level'),
        disable_log_file=getattr(opts, 'no_log_file'),
        log_dir=getattr(opts, 'log_dir'),
        res_dir=getattr(opts, 'res_dir'),
        delete_duplicates=getattr(opts, 'delete_duplicates')
    )
# end if main
