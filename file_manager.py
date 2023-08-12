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
import exif
import PIL, PIL.Image, PIL.ExifTags, PIL.TiffImagePlugin
import plum.exceptions
import plum.bitfields
from datetime import datetime

FILE_META_DELIM = '//'

logger = logging.getLogger('file-manager')

# file name pattern "name (\d+).<ext>" is not enough to uniquely identify a file! We need to use contents
def file_name_to_id(file_name) -> Optional[str]:
    stat = os.stat(file_name)
    size = stat.st_size
    is_dir = os.path.isdir(file_name)

    if is_dir:
        return None
    # end if dir
    else:
        # determine part of name expected to be shared among copies of a file
        full_name, ext = os.path.splitext(file_name)
        name_parts = [
            part 
            for part in re.split(r'\s+(?:\((\d+)\))|(?:copy\s?(\d*))\.', full_name)
            if part != ''
        ]

        return f'{name_parts[0]}_size={size}{ext}'
    # end else file
# end def

def _file_path_meta_str(file_path: str) -> str:
    file_meta = image_metadata(file_path=file_path, image_lib=PIL.__name__)
    if file_meta is None:
        return file_path
    else:
        try:
            meta_str = json.dumps(file_meta)
        except:
            logger.warning(f'unable to json stringify {file_path} metadata {file_meta}')
            meta_str = str(file_meta)

        return f'{file_path}{FILE_META_DELIM}{meta_str}'
# end def

def _index_file(
    index: Dict[str, List[str]], 
    file_id: str, 
    file_path: str, 
    exclude_metadata: bool
):
    if file_id not in index:
        index[file_id] = []
    # end new name

    if isinstance(file_path, str):
        if exclude_metadata:
            index[file_id].append(file_path)
        else:
            index[file_id].append(_file_path_meta_str(file_path=file_path))
    else:
        index[file_id] += [
            _file_path_meta_str(file_path=child_path)
            for child_path in file_path
        ]
# end def

def image_metadata(file_path: str, image_lib: str = exif.__name__, attempt: int = 0) -> Optional[Dict]:
    try:
        metadata: Dict = {}

        if image_lib == exif.__name__:
            with open(file_path, 'rb') as f:
                image: exif.Image = exif.Image(f)
            # end with

            if not image.has_exif:
                logger.debug(f'file {file_path} is not an image with EXIF metadata')
                return None
            # end if not exif

            metadata = image.get_all()

            if isinstance(metadata, Dict):
                for key, val in metadata.items():
                    if isinstance(val, plum.bitfields.BitFields):
                        metadata[key] = val.asdict()
                    # end if bitfields
                    # else, hopefully json serializable
                # end for items
            # end if dict
        # end exif

        elif image_lib == PIL.__name__:
            image: PIL.Image.Image = PIL.Image.open(file_path)
            image_exif: PIL.Image.Exif = image.getexif()

            for exif_id, val in image_exif.items():
                if isinstance(val, datetime):
                    val = val.isoformat(sep=' ')
                
                elif isinstance(val, PIL.TiffImagePlugin.IFDRational):
                    val = float(val)
                
                logger.debug(f'meta {PIL.ExifTags.TAGS[exif_id]} = {val}{type(val)}')

                metadata[PIL.ExifTags.TAGS[exif_id]] = val
            # end for exif items
        # end PIL

        else:
            raise NotImplementedError(f'cannot parse image metadata with library {image_lib}')
        # end library unknown

        return metadata
    # end try
    
    except IsADirectoryError:
        logger.debug(f'directory {file_path} is not an image')
        return None
    # end directory error

    except PIL.UnidentifiedImageError as e:
        logger.info(f'file {file_path} is not an image {e}')
        return None
    # end pillow format error

    except plum.exceptions.UnpackError as e:
        logger.info(f'file {file_path} unable to parse EXIF metadata {e}')

        if attempt < 1:
            logger.info('retry metadata parse with pillow')
            return image_metadata(
                file_path=file_path,
                image_lib=PIL.__name__,
                attempt=(attempt + 1)
            )
        else:
            return None
    # end exif unpack error
# end def

# TODO track progress and progressively write partial results
def find_duplicate_files(
    parent_dir: str, 
    res_dir: str, 
    skip_file_write=False, 
    recursive=False,
    exclude_metadata=False,
    skip_dot_underscore_macos_prefix=True
) -> Tuple[Dict, List[str]]:
    prev_dir = os.getcwd()
    logger.info(f'move from {prev_dir} to {parent_dir}')
    os.chdir(os.path.expanduser(parent_dir))

    index: Dict[str, str] = {}
    """Maps file ids (unique per file prefix and size and type/extension) to names.
    """
    duplicates: List[str] = []
    for file_name in sorted(os.listdir('.')):
        if file_name.startswith('./'):
            logger.debug(f'skip redundant file listing {file_name}')
            continue
        # end if includes current dir in name
        elif skip_dot_underscore_macos_prefix and file_name.startswith('._'):
            logger.debug(f'skip macos meta file {file_name}')
            continue
        # end if macos metadata file
        else:
            logger.debug(f'do not skip {file_name}')
        # end no skip
        
        file_id = file_name_to_id(file_name)

        if file_id is None:
            if recursive:
                logger.info(f'find duplicates from {file_name}/')
                sub_index, _ = find_duplicate_files(
                    parent_dir=file_name,
                    res_dir=res_dir,
                    skip_file_write=True,
                    recursive=True,
                    exclude_metadata=exclude_metadata
                )

                # merge child index into parent
                for sub_id, sub_file_names in sub_index.items():
                    for sub_file_name in sub_file_names:
                        if FILE_META_DELIM in sub_file_name:
                            sub_file_path = os.path.join(file_name, sub_file_name[:sub_file_name.index(FILE_META_DELIM)])
                        else:
                            sub_file_path = os.path.join(file_name, sub_file_name)
                        _index_file(index, sub_id, file_path=sub_file_path, exclude_metadata=exclude_metadata)

                        if len(index[sub_id]) > 1:
                            duplicates.append(sub_file_path)
                            logger.debug(f'found duplicate {sub_file_path} of {sub_id}')
                        # end if duplicate
                    # end for sub file
                # end for sub id
            else:
                logger.info(f'skip directory {file_name}/')
        # end if directory
        else:
            _index_file(index, file_id, file_path=file_name, exclude_metadata=exclude_metadata)

            if len(index[file_id]) > 1:
                duplicates.append(file_name)
                logger.debug(f'found duplicate {file_name} of {file_id}')
            # end if duplicate
        # end if file
    # end for

    if not skip_file_write:
        index_dir = os.path.join(prev_dir, res_dir, parent_dir.replace('/', '_'))
        os.makedirs(index_dir, exist_ok=True)

        index_file = os.path.join(index_dir, 'index.json')
        with open(index_file, 'w') as f:
            json.dump(index, fp=f, indent=2)
            logger.info(f'grouped files index for {parent_dir} saved to {index_file}')
        # end with
    # end file write
    else:
        logger.warning('skipped index file write')
    # end skip

    if not skip_file_write:
        duplicates_dir = index_dir
        os.makedirs(duplicates_dir, exist_ok=True)

        duplicates_file = os.path.join(duplicates_dir, 'duplicates.txt')
        with open(duplicates_file, 'w') as f:
            f.write('\n'.join(duplicates))
            logger.info(f'saved {len(duplicates)} duplicate names to {duplicates_file}')
        # end with
    # end file write
    else:
        logger.warning('skipped duplicates file write')
    # end skip

    logger.info(f'move back from {parent_dir} to {prev_dir}')
    os.chdir(prev_dir)

    return index, duplicates
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
            logger.info(f'delete duplicate file {duplicate_path}')
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

def main(
    log_level_name: str, 
    disable_log_file: bool, 
    log_dir: str, 
    res_dir: str, 
    delete_duplicates: bool,
    target_dir: str,
    recursive: bool,
    exclude_metadata: bool
):
    # init logging
    logger.setLevel(logs.name_to_level(log_level_name))

    logs.init_logging(None if disable_log_file else log_dir)

    logger.debug(f'set log level to {log_level_name}[{logger.getEffectiveLevel()}]')
    
    if not delete_duplicates:
        find_duplicate_files(
            parent_dir=target_dir, 
            res_dir=res_dir, 
            recursive=recursive,
            exclude_metadata=exclude_metadata
        )
    # end if find
    else:
        delete_duplicate_files(parent_dir=target_dir, res_dir=res_dir)
    # end else delete
# end def

if __name__ == '__main__':
    opt_parser = ArgumentParser(
        prog='file manager',
        description='Bulk operations on the file system',
        add_help=True,
        usage="""Bulk operations on the file system. Supported functions:
        - Create index of all files in a target directory.
            - Include metadata for each file in the index.
        - Delete logical duplicate files in a target directory. Requires having done the index function
        in a previous run.
        """
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
    opt_parser.add_argument(
        '--target-dir', '-t', default='target/',
        help='specify target directory to manage'
    )
    opt_parser.add_argument(
        '--recursive', '-r', action='store_true',
        help='enter all child directories and include all files discovered'
    )
    opt_parser.add_argument(
        '--exclude-metadata', action='store_true',
        help='Exclude collection of metadata in the files index.'
    )

    # parse args from argv, skipping program name
    opts = opt_parser.parse_args(sys.argv[1:])

    main(
        log_level_name=getattr(opts, 'log_level'),
        disable_log_file=getattr(opts, 'no_log_file'),
        log_dir=getattr(opts, 'log_dir'),
        res_dir=getattr(opts, 'res_dir'),
        delete_duplicates=getattr(opts, 'delete_duplicates'),
        target_dir=getattr(opts, 'target_dir'),
        recursive=getattr(opts, 'recursive'),
        exclude_metadata=getattr(opts, 'exclude_metadata')
    )
# end if main
