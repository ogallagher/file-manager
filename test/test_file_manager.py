"""Test file manager.
"""

from unittest import TestCase
import logging
import os
import file_manager
import logs

class TestFileManager(TestCase):
    logger: logging.Logger

    RESOURCE_DIR = 'test/resources'
    TARGET_DIR = os.path.join(RESOURCE_DIR, 'target')
    TARGET_IMG_DIR = os.path.join(TARGET_DIR, 'img')

    F_1 = 'one-two three_four (1).xyz'
    """Original text file"""
    F_2 = 'one-two three_four (2).xyz'
    """Full copy"""
    F_3 = 'one-two three_four (3).xyz'
    """Different content"""
    F_4 = 'one-two three four (4).xyz'
    """Different name"""
    F_5 = 'one-two three_four (5).abc'
    """Different extension"""
    F_6 = 'one-two three_four (1) copy.xyz'
    """Full copy, macos syntax."""
    F_7 = 'one-two three_four (1) copy 2.xyz'
    """Full copy, macos syntax 2."""

    I_1 = 'apple.png'
    """Original apple image file."""
    I_2 = 'apple (1).png'
    """Full copy, parenthesis syntax."""
    I_3 = 'apple copy.png'
    """Full copy, macos syntax."""
    I_4 = 'apple.jpg'
    """Converted to jpeg format."""
    I_5 = 'apple_meta.png'
    """Apple image file with exif metadata attributes added."""
    I_6 = 'IMG_2315.png'
    """Black dog by window and Ticket to Ride board game.
    Causes TiffByteOrder ValueError for exif library metadata parsing.
    """

    def setUpClass():
        logs.init_logging(logs_dir=os.path.join(TestFileManager.RESOURCE_DIR, 'logs'))
        TestFileManager.logger = logging.getLogger(TestFileManager.__name__)
        TestFileManager.logger.setLevel(logging.DEBUG)
        file_manager.logger.setLevel(logging.DEBUG)
    # end def

    def test_file_name_to_id_text(self):
        prev_dir = os.getcwd()
        os.chdir(self.TARGET_DIR)
        self.logger.debug(f'test target dir = {os.getcwd()}')

        # original
        id_1 = file_manager.file_name_to_id(self.F_1)
        # full copy
        id_2 = file_manager.file_name_to_id(self.F_2)
        # different content
        id_3 = file_manager.file_name_to_id(self.F_3)
        # different name
        id_4 = file_manager.file_name_to_id(self.F_4)
        # different extension
        id_5 = file_manager.file_name_to_id(self.F_5)
        # full copy macos
        id_6 = file_manager.file_name_to_id(self.F_6)
        # full copy macos 2
        id_7 = file_manager.file_name_to_id(self.F_7)

        for idx, id in enumerate([id_1, id_2, id_3, id_4, id_5, id_6, id_7]):
            self.logger.debug(f'id_{idx+1} = {id}')
        # end for

        self.assertEqual(id_1, id_2, f'failed to identify {id_2} as clone of {id_1}')
        self.assertNotEqual(id_1, id_3, f'failed to distinguish {id_3} by file contents')
        self.assertNotEqual(id_1, id_4, f'failed to distinguish {id_4} by file name')
        self.assertNotEqual(id_1, id_5, f'failed to distinguish {id_5} by file extension')
        self.assertEqual(id_1, id_6, f'failed to identifier {id_6} as clone of {id_1}')
        self.assertEqual(id_1, id_7, f'failed to identify {id_7} as clone of {id_1}')

        os.chdir(prev_dir)
    # end def

    def test_file_name_to_id_image(self):
        self.skipTest('not ready')
    # end def

    def test_find_duplicate_files_shallow(self):
        index, duplicates = file_manager.find_duplicate_files(
            parent_dir=self.TARGET_DIR,
            res_dir=None,
            skip_file_write=True,
            recursive=False,
            exclude_metadata=True
        )
        index_values = []
        for index_value in index.values():
            index_values += index_value

        self.assertEqual(duplicates[0], self.F_6)
        for file_name in [self.F_1, self.F_2, self.F_3, self.F_4, self.F_5]:
            self.assertIn(file_name, index_values)
    # end def

    def test_find_duplicate_files_deep(self):
        index, duplicates = file_manager.find_duplicate_files(
            parent_dir=self.TARGET_DIR,
            res_dir=os.path.join(self.RESOURCE_DIR, 'res', 'find_duplicate_files_deep'),
            skip_file_write=False,
            recursive=True,
            exclude_metadata=False
        )
        self.skipTest('not done')
    # end def

    def test_delete_duplicate_files_shallow(self):
        self.skipTest('not ready')
    # end def

    def test_delete_duplicate_files_deep(self):
        self.skipTest('not ready')
    # end def

    def test_image_metadata(self):
        # confirm exif supported image formats
        png_metadata = file_manager.image_metadata(os.path.join(self.TARGET_IMG_DIR, self.I_5))
        self.logger.info(f'{self.I_1} metadata = {png_metadata}')
        self.assertIsNotNone(png_metadata)

        jpg_metadata = file_manager.image_metadata(os.path.join(self.TARGET_IMG_DIR, self.I_4))
        self.logger.info(f'{self.I_4} metadata = {jpg_metadata}')
        self.assertIsNotNone(jpg_metadata)

        # confirm other files correctly recognized as not supported
        xyz_metadata = file_manager.image_metadata(os.path.join(self.TARGET_DIR, self.F_1))
        self.logger.info(f'{self.F_1} unsupported image metadata = {xyz_metadata}')
        self.assertIsNone(xyz_metadata)

        # confirm is a directory error
        self.assertIsNone(file_manager.image_metadata(self.TARGET_DIR))

        # TiffByteOrder ValueError, switch library from exif to pillow
        png_2315_metadata_exif = file_manager.image_metadata(
            os.path.join(self.TARGET_IMG_DIR, self.I_6), 
            image_lib='exif',
            attempt=1
        )
        self.logger.info(f'{self.I_6} exif metadata with exif lib = {png_2315_metadata_exif}')

        png_2315_metadata_pil = file_manager.image_metadata(
            os.path.join(self.TARGET_IMG_DIR, self.I_6),
            image_lib='PIL',
            attempt=1
        )
        self.logger.info(f'{self.I_6} exif metadata with PIL lib = {png_2315_metadata_pil}')

        self.assertTrue(
            png_2315_metadata_pil is not None if png_2315_metadata_exif is None 
            else png_2315_metadata_exif is not None
        )
    # end def
# end class